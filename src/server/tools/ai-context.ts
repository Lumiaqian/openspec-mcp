/**
 * AI Context Tools - AI 增强的项目上下文分析
 * 
 * 利用 MCP Sampling 能力调用 Client AI 进行深度分析
 * 并给出 project.md 更新建议
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ContextAnalyzer, ProjectContext } from '../../core/context-analyzer.js';

/**
 * 注册 AI Context 相关工具
 */
export function registerAIContextTools(
  server: McpServer,
  analyzer: ContextAnalyzer
): void {
  /**
   * AI 深度分析项目上下文
   */
  server.registerTool(
    'openspec_ai_analyze_context',
    {
      description: `使用 AI 深度分析项目上下文并给出 project.md 更新建议。
利用 MCP Client 的 AI 能力进行分析。`,
      inputSchema: z.object({
        focus: z
          .enum(['overview', 'architecture', 'improvements', 'conventions'])
          .optional()
          .describe('分析重点：overview(总览), architecture(架构), improvements(改进建议), conventions(约定规范)'),
      }),
    },
    async ({ focus = 'overview' }) => {
      try {
        // 1. 收集上下文
        const staticContext = await analyzer.analyze();
        const projectMd = await analyzer.getProjectMd();
        const keyFiles = await analyzer.getKeyFiles();

        // 2. 构建分析 Prompt
        const prompt = buildAnalysisPrompt(staticContext, projectMd, keyFiles, focus);

        // 3. 使用 MCP Sampling 请求 Client AI
        // 注意：这需要 Client 支持 sampling 能力
        const samplingResult = await requestSampling(server, prompt);

        if (!samplingResult.success) {
          // Sampling 不可用，返回静态分析结果
          return {
            content: [
              {
                type: 'text',
                text: `${formatStaticContext(staticContext, projectMd)}\n\n> ⚠️ 注意: AI 深度分析不可用（${samplingResult.error}）。以上为静态分析结果。`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: samplingResult.response,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `❌ 分析失败: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

/**
 * 构建分析 Prompt
 */
function buildAnalysisPrompt(
  context: ProjectContext,
  projectMd: string | null,
  keyFiles: Record<string, string>,
  focus: string
): string {
  const languagesSummary = context.stack.languages
    .slice(0, 5)
    .map((l) => `${l.name}: ${l.percentage}%`)
    .join(', ');

  const directoriesSummary = context.structure.mainDirectories
    .slice(0, 8)
    .map((d) => `${d.name}/ (${d.purpose}, ${d.fileCount} files)`)
    .join('\n');

  const focusInstructions: Record<string, string> = {
    overview: '请给出项目的整体概述和架构理解',
    architecture: '请深入分析项目架构设计，包括分层、模块划分、依赖关系',
    improvements: '请找出项目中可以改进的地方，包括代码组织、最佳实践、潜在问题',
    conventions: '请分析项目的编码约定和规范，建议补充缺失的约定',
  };

  return `你是一个资深软件架构师，请分析以下项目并给出见解。

## 分析重点
${focusInstructions[focus] || focusInstructions.overview}

## 当前 project.md
\`\`\`markdown
${projectMd || '(尚未创建 openspec/project.md)'}
\`\`\`

## 静态分析结果

### 技术栈
- 语言分布: ${languagesSummary}
- 框架: ${context.stack.frameworks.join(', ') || '未检测到'}
- 包管理器: ${context.stack.packageManager}
- 构建工具: ${context.stack.buildTools.join(', ') || '无'}
- 测试框架: ${context.stack.testFramework || '未检测到'}

### 目录结构
${directoriesSummary}

### 统计
- 文件总数: ${context.stats.totalFiles}
- 预估代码行数: ${context.stats.totalLines}

### 关键文件
${Object.entries(keyFiles)
  .map(([name, content]) => `#### ${name}\n\`\`\`\n${content.slice(0, 500)}${content.length > 500 ? '\n...(truncated)' : ''}\n\`\`\``)
  .join('\n\n')}

---

请按以下格式输出：

## 项目分析
(你对项目的理解和分析)

## project.md 更新建议
(如果 project.md 已存在，使用 diff 格式标注增删；如果不存在，给出完整的推荐内容)

\`\`\`markdown
(更新后的 project.md 内容或 diff)
\`\`\`
`;
}

/**
 * 请求 MCP Sampling
 */
async function requestSampling(
  server: McpServer,
  prompt: string
): Promise<{ success: true; response: string } | { success: false; error: string }> {
  try {
    // 检查 server 是否支持 createMessage
    if (typeof (server as any).createMessage !== 'function') {
      return {
        success: false,
        error: 'MCP Server 不支持 sampling，请确保 Client 支持此功能',
      };
    }

    const result = await (server as any).createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt,
          },
        },
      ],
      maxTokens: 3000,
      modelPreferences: {
        hints: [{ name: 'claude-3-5-sonnet' }],
      },
    });

    // 提取响应文本
    const responseText =
      typeof result.content === 'string'
        ? result.content
        : result.content?.text || JSON.stringify(result.content);

    return { success: true, response: responseText };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sampling error';
    return { success: false, error: message };
  }
}

/**
 * 格式化静态上下文（Sampling 不可用时的备选）
 * 提供完整的静态分析结果和 project.md 模板建议
 */
function formatStaticContext(context: ProjectContext, projectMd: string | null): string {
  const primaryLang = context.stack.languages[0];
  const langList = context.stack.languages.slice(0, 5).map(l => `${l.name} (${l.percentage}%)`).join(', ');
  
  const sections = [
    // 技术栈分析
    `## 项目分析（静态）`,
    '',
    `### 技术栈`,
    `| 项目 | 信息 |`,
    `|------|------|`,
    `| **主要语言** | ${primaryLang?.name || '未知'} (${primaryLang?.percentage || 0}%) |`,
    `| **语言分布** | ${langList} |`,
    `| **框架** | ${context.stack.frameworks.join(', ') || '未检测到'} |`,
    `| **包管理器** | ${context.stack.packageManager} |`,
    `| **构建工具** | ${context.stack.buildTools.join(', ') || '无'} |`,
    `| **测试框架** | ${context.stack.testFramework || '未检测到'} |`,
    '',
    
    // 目录结构
    `### 目录结构`,
    '',
    ...context.structure.mainDirectories.slice(0, 10).map(d => 
      `- \`${d.name}/\` - ${d.purpose} (${d.fileCount} 文件)`
    ),
    '',
    
    // 统计信息
    `### 统计`,
    `- **文件总数**: ${context.stats.totalFiles.toLocaleString()}`,
    `- **预估代码行**: ${context.stats.totalLines.toLocaleString()}`,
    '',
    
    // 架构模式
    `### 检测到的模式`,
    `- **架构风格**: ${context.patterns.architecture}`,
    `- **代码风格**: ${context.patterns.codeStyle.join(', ') || '未配置'}`,
    `- **约定规范**: ${context.patterns.conventions.join(', ') || '无'}`,
  ];
  
  // 如果 project.md 不存在，生成模板
  if (!projectMd) {
    sections.push(
      '',
      `---`,
      '',
      `## project.md 模板建议`,
      '',
      `你尚未创建 \`openspec/project.md\`。以下是基于静态分析的推荐模板：`,
      '',
      '```markdown',
      `# ${context.projectName}`,
      '',
      `## 项目概述`,
      `<!-- 描述项目的目的和主要功能 -->`,
      '',
      `## 技术栈`,
      `- **主要语言**: ${primaryLang?.name || '未知'}`,
      `- **框架**: ${context.stack.frameworks.join(', ') || '无'}`,
      `- **包管理器**: ${context.stack.packageManager}`,
      context.stack.testFramework ? `- **测试框架**: ${context.stack.testFramework}` : '',
      '',
      `## 项目结构`,
      ...context.structure.mainDirectories.slice(0, 6).map(d => `- \`${d.name}/\` - ${d.purpose}`),
      '',
      `## 开发约定`,
      `<!-- 描述编码规范、提交消息格式等 -->`,
      '',
      `## 外部依赖`,
      `<!-- 列出重要的外部服务或 API -->`,
      '```',
      '',
      `> 💡 将上述内容保存到 \`openspec/project.md\`，然后再次运行分析获取更好的结果。`
    );
  } else {
    sections.push(
      '',
      `---`,
      '',
      `## project.md 状态`,
      `✅ 已存在 \`openspec/project.md\`（${projectMd.length} 字符）`,
    );
  }
  
  return sections.filter(Boolean).join('\n');
}


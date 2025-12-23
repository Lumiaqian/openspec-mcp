/**
 * Context Tools - MCP 工具注册
 * 
 * 提供项目上下文分析相关的 MCP 工具
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ContextAnalyzer, ProjectContext, LanguageInfo } from '../../core/context-analyzer.js';

/**
 * 注册 Context 相关工具
 */
export function registerContextTools(server: McpServer, analyzer: ContextAnalyzer): void {
  // 分析项目上下文
  server.registerTool(
    'openspec_analyze_context',
    {
      description: '分析项目上下文（技术栈、目录结构、代码模式）',
      inputSchema: {
        refresh: z.boolean().optional().describe('是否强制刷新缓存，默认 false'),
      },
    },
    async ({ refresh = false }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const context = refresh 
          ? await analyzer.refreshContext()
          : await analyzer.analyze();
        
        const output = formatContext(context);
        
        return {
          content: [{ type: 'text', text: output }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `分析失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  // 获取上下文摘要
  server.registerTool(
    'openspec_get_context_summary',
    {
      description: '获取项目上下文摘要（技术栈和统计）',
      inputSchema: {},
    },
    async (): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const cached = await analyzer.getCachedContext();
        
        if (!cached) {
          return {
            content: [{ type: 'text', text: '没有缓存的上下文，请先运行 openspec_analyze_context' }],
          };
        }
        
        const lines = [
          `# 项目: ${cached.projectName}`,
          '',
          `**技术栈**: ${cached.stack.frameworks.join(', ') || '未检测到'}`,
          `**语言**: ${cached.stack.languages.slice(0, 3).map((l: LanguageInfo) => `${l.name} (${l.percentage}%)`).join(', ')}`,
          `**包管理**: ${cached.stack.packageManager}`,
          `**测试框架**: ${cached.stack.testFramework || '未检测到'}`,
          '',
          `**文件数**: ${cached.stats.totalFiles}`,
          `**预估行数**: ${cached.stats.totalLines.toLocaleString()}`,
          '',
          `*分析时间: ${cached.analyzedAt}*`,
        ];
        
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `获取摘要失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );
}

/**
 * 格式化上下文输出
 */
function formatContext(ctx: ProjectContext): string {
  const lines: string[] = [];
  
  // 标题
  lines.push(`# 📊 项目上下文: ${ctx.projectName}`);
  lines.push('');
  lines.push(`> 分析时间: ${ctx.analyzedAt}`);
  lines.push(`> 项目路径: ${ctx.projectRoot}`);
  lines.push('');
  
  // 技术栈
  lines.push('## 🛠️ 技术栈');
  lines.push('');
  
  // 语言分布
  lines.push('### 语言分布');
  lines.push('');
  lines.push('| 语言 | 占比 | 文件数 |');
  lines.push('|------|------|--------|');
  for (const lang of ctx.stack.languages.slice(0, 6)) {
    const bar = '█'.repeat(Math.round(lang.percentage / 10)) + '░'.repeat(10 - Math.round(lang.percentage / 10));
    lines.push(`| ${lang.name} | ${bar} ${lang.percentage}% | ${lang.fileCount} |`);
  }
  lines.push('');
  
  // 框架和工具
  if (ctx.stack.frameworks.length > 0) {
    lines.push(`**框架**: ${ctx.stack.frameworks.join(', ')}`);
  }
  if (ctx.stack.buildTools.length > 0) {
    lines.push(`**构建工具**: ${ctx.stack.buildTools.join(', ')}`);
  }
  lines.push(`**包管理器**: ${ctx.stack.packageManager}`);
  if (ctx.stack.testFramework) {
    lines.push(`**测试框架**: ${ctx.stack.testFramework}`);
  }
  lines.push('');
  
  // 目录结构
  lines.push('## 📁 目录结构');
  lines.push('');
  
  if (ctx.structure.mainDirectories.length > 0) {
    lines.push('| 目录 | 用途 | 文件数 |');
    lines.push('|------|------|--------|');
    for (const dir of ctx.structure.mainDirectories.slice(0, 8)) {
      lines.push(`| \`${dir.name}/\` | ${dir.purpose} | ${dir.fileCount} |`);
    }
    lines.push('');
  }
  
  if (ctx.structure.entryPoints.length > 0) {
    lines.push(`**入口点**: ${ctx.structure.entryPoints.map((e: string) => `\`${e}\``).join(', ')}`);
    lines.push('');
  }
  
  // 代码模式
  lines.push('## 🧩 代码模式');
  lines.push('');
  lines.push(`**架构**: ${ctx.patterns.architecture}`);
  if (ctx.patterns.codeStyle.length > 0) {
    lines.push(`**代码风格**: ${ctx.patterns.codeStyle.join(', ')}`);
  }
  if (ctx.patterns.conventions.length > 0) {
    lines.push(`**项目约定**: ${ctx.patterns.conventions.join(', ')}`);
  }
  lines.push('');
  
  // 统计
  lines.push('## 📈 统计');
  lines.push('');
  lines.push(`- **总文件数**: ${ctx.stats.totalFiles.toLocaleString()}`);
  lines.push(`- **预估总行数**: ${ctx.stats.totalLines.toLocaleString()}`);
  lines.push('');
  
  return lines.join('\n');
}

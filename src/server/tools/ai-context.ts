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
      description: `Analiza el contexto del proyecto con IA y sugiere actualizaciones a project.md.
Utiliza la capacidad de IA del MCP Client para el análisis.`,
      inputSchema: z.object({
        focus: z
          .enum(['overview', 'architecture', 'improvements', 'conventions'])
          .optional()
          .describe('Enfoque del análisis: overview(vista general), architecture(arquitectura), improvements(mejoras), conventions(convenciones)'),
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
                text: `${formatStaticContext(staticContext, projectMd)}\n\n> ⚠️ Nota: El análisis profundo con IA no está disponible (${samplingResult.error}). Se muestran resultados del análisis estático.`,
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
          content: [{ type: 'text', text: `❌ Error en el análisis: ${message}` }],
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
    overview: 'Proporciona una visión general del proyecto y su arquitectura',
    architecture: 'Analiza a fondo la arquitectura del proyecto, incluyendo capas, módulos y dependencias',
    improvements: 'Identifica áreas de mejora en el proyecto, incluyendo organización del código, mejores prácticas y problemas potenciales',
    conventions: 'Analiza las convenciones y estándares de codificación del proyecto, sugiere agregar las que falten',
  };

  return `Eres un arquitecto de software senior. Analiza el siguiente proyecto y proporciona tus observaciones.

## Enfoque del análisis
${focusInstructions[focus] || focusInstructions.overview}

## project.md actual
\`\`\`markdown
${projectMd || '(aún no se ha creado openspec/project.md)'}
\`\`\`

## Resultados del análisis estático

### Tecnologías
- Distribución de lenguajes: ${languagesSummary}
- Frameworks: ${context.stack.frameworks.join(', ') || 'No detectado'}
- Gestor de paquetes: ${context.stack.packageManager}
- Herramientas de compilación: ${context.stack.buildTools.join(', ') || 'Ninguna'}
- Framework de pruebas: ${context.stack.testFramework || 'No detectado'}
|
### Estructura de directorios
${directoriesSummary}

### Estadísticas
- Archivos totales: ${context.stats.totalFiles}
- Líneas de código estimadas: ${context.stats.totalLines}

### Archivos clave
${Object.entries(keyFiles)
  .map(([name, content]) => `#### ${name}\n\`\`\`\n${content.slice(0, 500)}${content.length > 500 ? '\n...(truncated)' : ''}\n\`\`\``)
  .join('\n\n')}

---

Usa el siguiente formato de salida:

## Análisis del proyecto
(Tu comprensión y análisis del proyecto)

## Sugerencias de actualización para project.md
(Si project.md ya existe, usa formato diff para marcar cambios; si no existe, proporciona el contenido completo recomendado)

\`\`\`markdown
(Contenido actualizado de project.md o diff)
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
        error: 'El MCP Server no soporta sampling. Asegúrate de que el Client tenga esta funcionalidad',
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
    `## Análisis del proyecto (estático)`,
    '',
    `### Tecnologías`,
    `| Proyecto | Información |`,
    `|------|------|`,
    `| **Lenguaje principal** | ${primaryLang?.name || 'Desconocido'} (${primaryLang?.percentage || 0}%) |`,
    `| **Distribución de lenguajes** | ${langList} |`,
    `| **Frameworks** | ${context.stack.frameworks.join(', ') || 'No detectado'} |`,
    `| **Gestor de paquetes** | ${context.stack.packageManager} |`,
    `| **Herramientas de compilación** | ${context.stack.buildTools.join(', ') || 'Ninguna'} |`,
    `| **Framework de pruebas** | ${context.stack.testFramework || 'No detectado'} |`,
    '',
    
    // 目录结构
    `### Estructura de directorios`,
    '',
    ...context.structure.mainDirectories.slice(0, 10).map(d => 
      `- \`${d.name}/\` - ${d.purpose} (${d.fileCount} archivos)`
    ),
    '',
    
    // 统计信息
    `### Estadísticas`,
    `- **Archivos totales**: ${context.stats.totalFiles.toLocaleString()}`,
    `- **Líneas de código estimadas**: ${context.stats.totalLines.toLocaleString()}`,
    '',
    
    // 架构模式
    `### Patrones detectados`,
    `- **Estilo de arquitectura**: ${context.patterns.architecture}`,
    `- **Estilo de código**: ${context.patterns.codeStyle.join(', ') || 'Sin configurar'}`,
    `- **Convenciones**: ${context.patterns.conventions.join(', ') || 'Ninguna'}`,
  ];
  
  // 如果 project.md 不存在，生成模板
  if (!projectMd) {
    sections.push(
      '',
      `---`,
      '',
      `## Plantilla sugerida para project.md`,
      '',
      `Aún no has creado \`openspec/project.md\`. Aquí tienes una plantilla recomendada basada en el análisis estático:`,
      '',
      '```markdown',
      `# ${context.projectName}`,
      '',
      `## Resumen del proyecto`,
      `<!-- Describe el propósito y funcionalidad principal del proyecto -->`,
      '',
      `## Tecnologías`,
      `- **Lenguaje principal**: ${primaryLang?.name || 'Desconocido'}`,
      `- **Frameworks**: ${context.stack.frameworks.join(', ') || 'Ninguno'}`,
      `- **Gestor de paquetes**: ${context.stack.packageManager}`,
      context.stack.testFramework ? `- **Framework de pruebas**: ${context.stack.testFramework}` : '',
      '',
      `## Estructura del proyecto`,
      ...context.structure.mainDirectories.slice(0, 6).map(d => `- \`${d.name}/\` - ${d.purpose}`),
      '',
      `## Convenciones de desarrollo`,
      `<!-- Describe estándares de codificación, formato de mensajes de commit, etc. -->`,
      '',
      `## Dependencias externas`,
      `<!-- Enumera servicios o APIs externas importantes -->`,
      '```',
      '',
      `> 💡 Guarda el contenido anterior en \`openspec/project.md\` y vuelve a ejecutar el análisis para obtener mejores resultados.`
    );
  } else {
    sections.push(
      '',
      `---`,
      '',
      `## Estado de project.md`,
      `✅ \`openspec/project.md\` ya existe (${projectMd.length} caracteres)`,
    );
  }
  
  return sections.filter(Boolean).join('\n');
}


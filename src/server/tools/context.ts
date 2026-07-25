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
      description: 'Analiza el contexto del proyecto (tecnologías, estructura de directorios, patrones de código)',
      inputSchema: {
        refresh: z.boolean().optional().describe('Forzar actualización de caché, por defecto false'),
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
            text: `Error en el análisis: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
  lines.push(`# 📊 Contexto del proyecto: ${ctx.projectName}`);
  lines.push('');
  lines.push(`> Analizado el: ${ctx.analyzedAt}`);
  lines.push(`> Ruta del proyecto: ${ctx.projectRoot}`);
  lines.push('');
  
  // 技术栈
  lines.push('## 🛠️ Tecnologías');
  lines.push('');
  
  // 语言分布
  lines.push('### Distribución de lenguajes');
  lines.push('');
  lines.push('| Lenguaje | % | Archivos |');
  lines.push('|------|------|--------|');
  for (const lang of ctx.stack.languages.slice(0, 6)) {
    const bar = '█'.repeat(Math.round(lang.percentage / 10)) + '░'.repeat(10 - Math.round(lang.percentage / 10));
    lines.push(`| ${lang.name} | ${bar} ${lang.percentage}% | ${lang.fileCount} |`);
  }
  lines.push('');
  
  // 框架和工具
  if (ctx.stack.frameworks.length > 0) {
    lines.push(`**Frameworks**: ${ctx.stack.frameworks.join(', ')}`);
  }
  if (ctx.stack.buildTools.length > 0) {
    lines.push(`**Herramientas de compilación**: ${ctx.stack.buildTools.join(', ')}`);
  }
  lines.push(`**Gestor de paquetes**: ${ctx.stack.packageManager}`);
  if (ctx.stack.testFramework) {
    lines.push(`**Framework de pruebas**: ${ctx.stack.testFramework}`);
  }
  lines.push('');
  
  // 目录结构
  lines.push('## 📁 Estructura de directorios');
  lines.push('');
  
  if (ctx.structure.mainDirectories.length > 0) {
    lines.push('| Directorio | Propósito | Archivos |');
    lines.push('|------|------|--------|');
    for (const dir of ctx.structure.mainDirectories.slice(0, 8)) {
      lines.push(`| \`${dir.name}/\` | ${dir.purpose} | ${dir.fileCount} |`);
    }
    lines.push('');
  }
  
  if (ctx.structure.entryPoints.length > 0) {
    lines.push(`**Puntos de entrada**: ${ctx.structure.entryPoints.map((e: string) => `\`${e}\``).join(', ')}`);
    lines.push('');
  }
  
  // 代码模式
  lines.push('## 🧩 Patrones de código');
  lines.push('');
  lines.push(`**Arquitectura**: ${ctx.patterns.architecture}`);
  if (ctx.patterns.codeStyle.length > 0) {
    lines.push(`**Estilo de código**: ${ctx.patterns.codeStyle.join(', ')}`);
  }
  if (ctx.patterns.conventions.length > 0) {
    lines.push(`**Convenciones del proyecto**: ${ctx.patterns.conventions.join(', ')}`);
  }
  lines.push('');
  
  // 统计
  lines.push('## 📈 Estadísticas');
  lines.push('');
  lines.push(`- **Total de archivos**: ${ctx.stats.totalFiles.toLocaleString()}`);
  lines.push(`- **Líneas totales estimadas**: ${ctx.stats.totalLines.toLocaleString()}`);
  lines.push('');
  
  return lines.join('\n');
}

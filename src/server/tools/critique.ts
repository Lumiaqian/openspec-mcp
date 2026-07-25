/**
 * Critique Tools - MCP 工具注册
 * 
 * 提供规格自审相关的 MCP 工具
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SpecCritic, CritiqueResult, Critique } from '../../core/spec-critic.js';

/**
 * 注册 Critique 相关工具
 */
export function registerCritiqueTools(server: McpServer, critic: SpecCritic): void {
  // 评审 Proposal/Design
  server.registerTool(
    'openspec_critique_proposal',
    {
      description: 'Revisa documentos proposal o design, identificando problemas potenciales (integridad, factibilidad, seguridad, casos límite, claridad)',
      inputSchema: {
        changeName: z.string().describe('ID del cambio'),
        documentType: z.enum(['proposal', 'design', 'all']).optional().describe('Tipo de documento, por defecto proposal'),
      },
    },
    async ({ changeName, documentType = 'proposal' }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        let result: CritiqueResult;
        
        switch (documentType) {
          case 'design':
            result = await critic.critiqueDesign(changeName);
            break;
          case 'all':
            result = await critic.critiqueAll(changeName);
            break;
          default:
            result = await critic.critiqueProposal(changeName);
        }
        
        // 格式化输出
        const output = formatCritiqueResult(result);
        
        return {
          content: [{ type: 'text', text: output }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error en la revisión: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  // 获取评审结果（支持最新或历史）
  server.registerTool(
    'openspec_get_critique_result',
    {
      description: 'Obtiene resultados de revisión del cambio (último o histórico)',
      inputSchema: {
        changeName: z.string().describe('ID del cambio'),
        latest: z.boolean().optional().describe('Obtener solo el último resultado, por defecto true'),
        limit: z.number().optional().describe('Límite de registros históricos (solo cuando latest=false), por defecto 5'),
      },
    },
    async ({ changeName, latest = true, limit = 5 }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        if (latest) {
          // 获取最新结果
          const result = await critic.getLatestCritique(changeName);
          
          if (!result) {
                return {
                  content: [{ type: 'text', text: `No se encontraron registros de revisión para ${changeName}. Ejecuta openspec_critique_proposal primero` }],
                };
              }
          
          const output = formatCritiqueResult(result);
          return { content: [{ type: 'text', text: output }] };
        } else {
          // 获取历史记录
          const history = await critic.getCritiqueHistory(changeName);
          const limited = history.slice(0, limit);
          
          if (limited.length === 0) {
            return {
              content: [{ type: 'text', text: `No se encontró historial de revisión para ${changeName}` }],
            };
          }
          
          const output = limited.map((r: CritiqueResult, i: number) => {
            return `## ${i + 1}. ${r.documentType} (${r.createdAt})
- Puntaje total: ${r.overallScore}/10
- Problemas: ${r.summary.total} (Critical: ${r.summary.critical}, Warning: ${r.summary.warning}, Info: ${r.summary.info})`;
          }).join('\n\n');
          
          return {
            content: [{ type: 'text', text: `No se encontró historial de revisión para ${changeName}` }],
          };
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error al obtener: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );
}

/**
 * 格式化评审结果
 */
function formatCritiqueResult(result: CritiqueResult): string {
  const lines: string[] = [];
  
  // 标题和总分
  lines.push(`# 📋 Reporte de revisión: ${result.changeName}`);
  lines.push('');
  lines.push(`- **Tipo de documento**: ${result.documentType}`);
  lines.push(`- **Fecha de revisión**: ${result.createdAt}`);
  lines.push(`- **Puntaje total**: ${getScoreEmoji(result.overallScore)} **${result.overallScore}/10**`);
  lines.push('');
  
  // 统计摘要
  lines.push('## 📊 Resumen estadístico');
  lines.push('');
  lines.push(`| Categoría | Cantidad |`);
  lines.push(`|-----------|:--------:|`);
  lines.push(`| 🔴 Critical | ${result.summary.critical} |`);
  lines.push(`| 🟡 Warning | ${result.summary.warning} |`);
  lines.push(`| 🔵 Info | ${result.summary.info} |`);
  lines.push(`| **Total** | **${result.summary.total}** |`);
  lines.push('');
  
  // 按类别分组展示问题
  if (result.critiques.length > 0) {
    lines.push('## 🔍 Problemas encontrados');
    lines.push('');
    
    const bySeverity = {
      critical: result.critiques.filter((c: Critique) => c.severity === 'critical'),
      warning: result.critiques.filter((c: Critique) => c.severity === 'warning'),
      info: result.critiques.filter((c: Critique) => c.severity === 'info'),
    };
    
    for (const [severity, critiques] of Object.entries(bySeverity)) {
      if (critiques.length === 0) continue;
      
      const emoji = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : '🔵';
      
      for (const c of critiques) {
        lines.push(`### ${emoji} ${c.title}`);
        lines.push('');
        lines.push(`**Categoría**: ${getCategoryLabel(c.category)}`);
        lines.push('');
        lines.push(c.description);
        if (c.suggestion) {
          lines.push('');
          lines.push(`> 💡 **Sugerencia**: ${c.suggestion}`);
        }
        lines.push('');
      }
    }
  } else {
    lines.push('## ✅ No se encontraron problemas');
    lines.push('');
    lines.push('El documento pasa todas las reglas de revisión.');
    lines.push('');
  }
  
  // 综合建议
  if (result.suggestions.length > 0) {
    lines.push('## 💡 Sugerencias de mejora');
    lines.push('');
    for (const s of result.suggestions) {
      lines.push(`- ${s}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

function getScoreEmoji(score: number): string {
  if (score >= 8) return '✅';
  if (score >= 6) return '⚠️';
  if (score >= 4) return '🟡';
  return '❌';
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    completeness: 'Integridad',
    feasibility: 'Factibilidad técnica',
    security: 'Consideraciones de seguridad',
    edge_case: 'Casos límite',
    clarity: 'Claridad',
  };
  return labels[category] || category;
}

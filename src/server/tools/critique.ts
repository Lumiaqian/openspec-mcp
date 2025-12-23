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
      description: '评审 proposal 或 design 文档，识别潜在问题（完整性、可行性、安全、边界条件、清晰度）',
      inputSchema: {
        changeName: z.string().describe('变更 ID'),
        documentType: z.enum(['proposal', 'design', 'all']).optional().describe('文档类型，默认 proposal'),
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
            text: `评审失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  // 获取评审历史
  server.registerTool(
    'openspec_get_critique_history',
    {
      description: '获取变更的评审历史记录',
      inputSchema: {
        changeName: z.string().describe('变更 ID'),
        limit: z.number().optional().describe('返回记录数量限制，默认 5'),
      },
    },
    async ({ changeName, limit = 5 }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const history = await critic.getCritiqueHistory(changeName);
        const limited = history.slice(0, limit);
        
        if (limited.length === 0) {
          return {
            content: [{ type: 'text', text: `没有找到 ${changeName} 的评审历史` }],
          };
        }
        
        const output = limited.map((r: CritiqueResult, i: number) => {
          return `## ${i + 1}. ${r.documentType} (${r.createdAt})
- 总分: ${r.overallScore}/10
- 问题: ${r.summary.total} (Critical: ${r.summary.critical}, Warning: ${r.summary.warning}, Info: ${r.summary.info})`;
        }).join('\n\n');
        
        return {
          content: [{ type: 'text', text: `# ${changeName} 评审历史\n\n${output}` }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `获取历史失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  // 获取最新评审结果
  server.registerTool(
    'openspec_get_latest_critique',
    {
      description: '获取变更的最新评审结果',
      inputSchema: {
        changeName: z.string().describe('变更 ID'),
      },
    },
    async ({ changeName }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const result = await critic.getLatestCritique(changeName);
        
        if (!result) {
          return {
            content: [{ type: 'text', text: `没有找到 ${changeName} 的评审记录，请先运行 openspec_critique_proposal` }],
          };
        }
        
        const output = formatCritiqueResult(result);
        
        return {
          content: [{ type: 'text', text: output }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `获取失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
  lines.push(`# 📋 ${result.changeName} 评审报告`);
  lines.push('');
  lines.push(`- **文档类型**: ${result.documentType}`);
  lines.push(`- **评审时间**: ${result.createdAt}`);
  lines.push(`- **总分**: ${getScoreEmoji(result.overallScore)} **${result.overallScore}/10**`);
  lines.push('');
  
  // 统计摘要
  lines.push('## 📊 统计摘要');
  lines.push('');
  lines.push(`| 类别 | 数量 |`);
  lines.push(`|------|------|`);
  lines.push(`| 🔴 Critical | ${result.summary.critical} |`);
  lines.push(`| 🟡 Warning | ${result.summary.warning} |`);
  lines.push(`| 🔵 Info | ${result.summary.info} |`);
  lines.push(`| **总计** | **${result.summary.total}** |`);
  lines.push('');
  
  // 按类别分组展示问题
  if (result.critiques.length > 0) {
    lines.push('## 🔍 发现的问题');
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
        lines.push(`**类别**: ${getCategoryLabel(c.category)}`);
        lines.push('');
        lines.push(c.description);
        if (c.suggestion) {
          lines.push('');
          lines.push(`> 💡 **建议**: ${c.suggestion}`);
        }
        lines.push('');
      }
    }
  } else {
    lines.push('## ✅ 没有发现问题');
    lines.push('');
    lines.push('文档通过所有检查规则。');
    lines.push('');
  }
  
  // 综合建议
  if (result.suggestions.length > 0) {
    lines.push('## 💡 改进建议');
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
    completeness: '完整性',
    feasibility: '技术可行性',
    security: '安全考量',
    edge_case: '边界条件',
    clarity: '清晰度',
  };
  return labels[category] || category;
}

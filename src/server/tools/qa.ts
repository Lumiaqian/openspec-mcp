/**
 * QA Tools - MCP 工具注册
 * 
 * 提供质量检查相关的 MCP 工具
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { QARunner, QAResult, QACheckType } from '../../core/qa-runner.js';

/**
 * 注册 QA 相关工具
 */
export function registerQATools(server: McpServer, qaRunner: QARunner): void {
  // 运行 QA 检查
  server.registerTool(
    'openspec_run_qa',
    {
      description: '运行质量检查（语法、类型、lint、测试等）',
      inputSchema: {
        changeName: z.string().describe('变更 ID'),
        checks: z.array(z.enum(['syntax', 'typecheck', 'lint', 'test', 'build'])).optional()
          .describe('要运行的检查类型，默认: typecheck, lint, test'),
      },
    },
    async ({ changeName, checks }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        // 检查是否已在运行
        if (qaRunner.isRunning(changeName)) {
          return {
            content: [{
              type: 'text',
              text: `QA 正在运行中，请稍候或使用 openspec_stop_qa 停止`,
            }],
          };
        }
        
        const result = await qaRunner.runQA(changeName, {
          checks: checks as QACheckType[] | undefined,
        });
        
        const output = formatQAResult(result);
        
        return {
          content: [{ type: 'text', text: output }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `QA 运行失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  // 获取 QA 状态
  server.registerTool(
    'openspec_get_qa_status',
    {
      description: '获取变更的 QA 状态',
      inputSchema: {
        changeName: z.string().describe('变更 ID'),
      },
    },
    async ({ changeName }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        // 先检查是否正在运行
        if (qaRunner.isRunning(changeName)) {
          return {
            content: [{ type: 'text', text: `⏳ QA 正在运行中...` }],
          };
        }
        
        const result = await qaRunner.getQAStatus(changeName);
        
        if (!result) {
          return {
            content: [{ type: 'text', text: `没有找到 ${changeName} 的 QA 记录，请运行 openspec_run_qa` }],
          };
        }
        
        const output = formatQAResult(result);
        
        return {
          content: [{ type: 'text', text: output }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `获取状态失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  // 获取 QA 历史
  server.registerTool(
    'openspec_get_qa_history',
    {
      description: '获取变更的 QA 历史记录',
      inputSchema: {
        changeName: z.string().describe('变更 ID'),
        limit: z.number().optional().describe('返回记录数量限制，默认 5'),
      },
    },
    async ({ changeName, limit = 5 }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const history = await qaRunner.getQAHistory(changeName, limit);
        
        if (history.length === 0) {
          return {
            content: [{ type: 'text', text: `没有找到 ${changeName} 的 QA 历史` }],
          };
        }
        
        const lines = [`# ${changeName} QA 历史\n`];
        
        for (const r of history) {
          const statusEmoji = getStatusEmoji(r.status);
          lines.push(`## ${statusEmoji} ${r.completedAt || r.startedAt}`);
          lines.push(`- 状态: ${r.status}`);
          lines.push(`- 通过: ${r.summary.passed}/${r.summary.total}`);
          lines.push('');
        }
        
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
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

  // 停止 QA
  server.registerTool(
    'openspec_stop_qa',
    {
      description: '停止正在运行的 QA 检查',
      inputSchema: {
        changeName: z.string().describe('变更 ID'),
      },
    },
    async ({ changeName }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const stopped = await qaRunner.stopQA(changeName);
        
        if (stopped) {
          return {
            content: [{ type: 'text', text: `✅ 已发送停止信号给 ${changeName} 的 QA` }],
          };
        } else {
          return {
            content: [{ type: 'text', text: `ℹ️ ${changeName} 没有正在运行的 QA` }],
          };
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `停止失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  // 获取所有变更的 QA 汇总
  server.registerTool(
    'openspec_get_qa_summary',
    {
      description: '获取所有变更的 QA 状态汇总',
      inputSchema: {},
    },
    async (): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const summary = await qaRunner.getQASummary();
        
        const lines = [
          `# QA 汇总`,
          '',
          `| 指标 | 数量 |`,
          `|------|------|`,
          `| 总变更数 | ${summary.total} |`,
          `| ✅ 通过 | ${summary.passed} |`,
          `| ❌ 失败 | ${summary.failed} |`,
          `| ⏳ 运行中 | ${summary.running} |`,
          '',
        ];
        
        if (summary.changes.length > 0) {
          lines.push('## 变更详情');
          lines.push('');
          lines.push('| 变更 | 状态 | 最后运行 |');
          lines.push('|------|------|----------|');
          
          for (const change of summary.changes) {
            const emoji = getStatusEmoji(change.status);
            lines.push(`| ${change.name} | ${emoji} ${change.status} | ${change.lastRun || '-'} |`);
          }
        }
        
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `获取汇总失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );
}

/**
 * 格式化 QA 结果
 */
function formatQAResult(result: QAResult): string {
  const lines: string[] = [];
  
  // 标题和状态
  const statusEmoji = getStatusEmoji(result.status);
  lines.push(`# ${statusEmoji} QA 报告: ${result.changeName}`);
  lines.push('');
  lines.push(`- **状态**: ${result.status.toUpperCase()}`);
  lines.push(`- **开始时间**: ${result.startedAt}`);
  if (result.completedAt) {
    lines.push(`- **完成时间**: ${result.completedAt}`);
  }
  lines.push('');
  
  // 统计
  lines.push('## 📊 统计');
  lines.push('');
  lines.push(`| 指标 | 数量 |`);
  lines.push(`|------|------|`);
  lines.push(`| ✅ 通过 | ${result.summary.passed} |`);
  lines.push(`| ❌ 失败 | ${result.summary.failed} |`);
  lines.push(`| ⏭️ 跳过 | ${result.summary.skipped} |`);
  lines.push(`| **总计** | **${result.summary.total}** |`);
  lines.push('');
  
  // 检查详情
  if (result.checks.length > 0) {
    lines.push('## 🔍 检查详情');
    lines.push('');
    
    for (const check of result.checks) {
      const checkEmoji = check.status === 'passed' ? '✅' : 
                         check.status === 'failed' ? '❌' :
                         check.status === 'timeout' ? '⏱️' : '⏭️';
      
      lines.push(`### ${checkEmoji} ${check.type}`);
      lines.push('');
      lines.push(`- 状态: ${check.status}`);
      lines.push(`- 耗时: ${(check.duration / 1000).toFixed(2)}s`);
      
      if (check.errors && check.errors.length > 0) {
        lines.push('');
        lines.push('**错误:**');
        for (const err of check.errors.slice(0, 3)) {
          lines.push(`\`\`\`\n${err.slice(0, 500)}\n\`\`\``);
        }
      }
      
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'passed': return '✅';
    case 'failed': return '❌';
    case 'running': return '⏳';
    case 'fixing': return '🔧';
    case 'timeout': return '⏱️';
    case 'stopped': return '🛑';
    default: return '⏸️';
  }
}

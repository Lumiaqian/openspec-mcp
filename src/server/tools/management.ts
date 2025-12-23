/**
 * Management 类工具
 * 列表和查看规格、变更
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenSpecCli } from '../../core/openspec-cli.js';

export function registerManagementTools(server: McpServer, cli: OpenSpecCli): void {
  /**
   * 列出所有变更
   */
  server.registerTool(
    'openspec_list_changes',
    {
      description: 'List all OpenSpec change proposals',
      inputSchema: {
        includeArchived: z
          .boolean()
          .optional()
          .describe('Include archived changes in the list'),
      },
    },
    async ({ includeArchived }) => {
      const changes = await cli.listChanges({ includeArchived });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(changes, null, 2),
          },
        ],
      };
    }
  );

  /**
   * 列出所有规格
   */
  server.registerTool(
    'openspec_list_specs',
    {
      description: 'List all OpenSpec specifications',
      inputSchema: {},
    },
    async () => {
      const specs = await cli.listSpecs();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(specs, null, 2),
          },
        ],
      };
    }
  );

  /**
   * 显示变更详情
   */
  server.registerTool(
    'openspec_show_change',
    {
      description: 'Show details of a specific change proposal',
      inputSchema: {
        changeId: z.string().describe('Change ID (e.g., add-lite-effect-trial-binding)'),
        deltasOnly: z.boolean().optional().describe('Show only delta specs'),
        summary: z.boolean().optional().default(false).describe('Return summary only (smaller response)'),
        maxContentLength: z.number().optional().default(2000).describe('Max characters for proposal/design content'),
        maxTasks: z.number().optional().default(20).describe('Max number of tasks to return'),
      },
    },
    async ({ changeId, deltasOnly, summary, maxContentLength, maxTasks }) => {
      const change = await cli.showChange(changeId, { deltasOnly });

      if (!change) {
        return {
          content: [
            {
              type: 'text',
              text: `Change not found: ${changeId}`,
            },
          ],
          isError: true,
        };
      }

      // Summary 模式：只返回基本信息
      if (summary) {
        const summaryData = {
          id: change.id,
          title: change.title,
          status: change.status,
          tasksCompleted: change.tasksCompleted,
          tasksTotal: change.tasksTotal,
          deltasCount: change.deltas?.length || 0,
          hasDesign: !!change.design,
          proposalPreview: change.proposal?.substring(0, 300) + (change.proposal?.length > 300 ? '...' : ''),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(summaryData, null, 2) }],
        };
      }

      // 截断过长的内容
      const tasks = change.tasks || [];
      const truncatedChange: Record<string, unknown> = {
        ...change,
        proposal: change.proposal?.length > maxContentLength
          ? change.proposal.substring(0, maxContentLength) + `\n\n... [truncated, ${change.proposal.length - maxContentLength} chars remaining]`
          : change.proposal,
        design: change.design && change.design.length > maxContentLength
          ? change.design.substring(0, maxContentLength) + `\n\n... [truncated, ${change.design.length - maxContentLength} chars remaining]`
          : change.design,
        // 限制 tasks 数量
        tasks: tasks.length > maxTasks
          ? [...tasks.slice(0, maxTasks), { id: '...', name: `... and ${tasks.length - maxTasks} more tasks`, status: 'info' }]
          : tasks,
        // 限制 deltas 内容
        deltas: change.deltas?.slice(0, 10).map((delta: any) => ({
          ...delta,
          content: delta.content?.length > 1000
            ? delta.content.substring(0, 1000) + `\n\n... [truncated]`
            : delta.content,
        })),
        // 如果 deltas 被截断，添加提示
        deltasNote: change.deltas?.length > 10 ? `Showing 10 of ${change.deltas.length} deltas` : undefined,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(truncatedChange, null, 2),
          },
        ],
      };
    }
  );

  /**
   * 显示规格详情
   */
  server.registerTool(
    'openspec_show_spec',
    {
      description: 'Show details of a specific specification',
      inputSchema: {
        specId: z.string().describe('Spec ID (e.g., offline-message)'),
      },
    },
    async ({ specId }) => {
      const spec = await cli.showSpec(specId);

      if (!spec) {
        return {
          content: [
            {
              type: 'text',
              text: `Spec not found: ${specId}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(spec, null, 2),
          },
        ],
      };
    }
  );
}

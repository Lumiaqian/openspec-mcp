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
  server.tool(
    'openspec_list_changes',
    'List all OpenSpec change proposals',
    {
      includeArchived: z
        .boolean()
        .optional()
        .describe('Include archived changes in the list'),
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
  server.tool(
    'openspec_list_specs',
    'List all OpenSpec specifications',
    {},
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
  server.tool(
    'openspec_show_change',
    'Show details of a specific change proposal',
    {
      changeId: z.string().describe('Change ID (e.g., add-lite-effect-trial-binding)'),
      deltasOnly: z.boolean().optional().describe('Show only delta specs'),
    },
    async ({ changeId, deltasOnly }) => {
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

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(change, null, 2),
          },
        ],
      };
    }
  );

  /**
   * 显示规格详情
   */
  server.tool(
    'openspec_show_spec',
    'Show details of a specific specification',
    {
      specId: z.string().describe('Spec ID (e.g., offline-message)'),
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

/**
 * Archive 类工具
 * 归档已完成的变更
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenSpecCli } from '../../core/openspec-cli.js';

export function registerArchiveTools(server: McpServer, cli: OpenSpecCli): void {
  /**
   * 归档变更
   */
  server.registerTool(
    'openspec_archive_change',
    {
      description: 'Archive a completed change proposal',
      inputSchema: {
        changeId: z.string().describe('Change ID to archive'),
        skipSpecs: z
          .boolean()
          .optional()
          .describe('Skip merging delta specs into main specs'),
      },
    },
    async ({ changeId, skipSpecs }) => {
      const result = await cli.archiveChange(changeId, { skipSpecs });

      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully archived change: ${changeId}\n\nArchived to: ${result.archivedPath}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to archive change: ${changeId}\n\nError: ${result.error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

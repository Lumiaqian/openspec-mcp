/**
 * Revision Tools
 * 设计变更记录工具
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RevisionManager } from '../../core/revision-manager.js';

export function registerRevisionTools(server: McpServer, manager: RevisionManager): void {
  /**
   * 记录设计变更
   * AI 在修复 bug 或调整设计时应调用此工具
   */
  server.registerTool(
    'openspec_record_revision',
    {
      description: 'Record a design revision when fixing bugs or adjusting design that deviates from the original proposal/design. Call this when your changes affect the documented design.',
      inputSchema: {
        changeId: z.string().describe('Change ID'),
        description: z.string().describe('Description of the design change (e.g., "Simplified approval states from 6 to 5")'),
        reason: z.string().optional().describe('Reason for the change (e.g., "UI was too complex")'),
      },
    },
    async ({ changeId, description, reason }) => {
      try {
        const revision = await manager.recordRevision(changeId, description, { reason });
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Revision recorded for "${changeId}"\n\n**ID**: ${revision.id}\n**Description**: ${revision.description}\n**Reason**: ${revision.reason || '-'}\n**Time**: ${revision.createdAt}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * 列出设计变更
   */
  server.registerTool(
    'openspec_list_revisions',
    {
      description: 'List all recorded design revisions for a change',
      inputSchema: {
        changeId: z.string().describe('Change ID'),
      },
    },
    async ({ changeId }) => {
      try {
        const revisions = await manager.listRevisions(changeId);
        
        if (revisions.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No revisions recorded for "${changeId}".`,
              },
            ],
          };
        }

        let output = `## Revisions for "${changeId}"\n\n`;
        output += `Total: ${revisions.length}\n\n`;
        output += '| Date | Description | Reason |\n';
        output += '|------|-------------|--------|\n';
        
        for (const rev of revisions) {
          const date = rev.createdAt.slice(0, 10);
          output += `| ${date} | ${rev.description} | ${rev.reason || '-'} |\n`;
        }

        return {
          content: [{ type: 'text', text: output }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * 同步变更到文档
   */
  server.registerTool(
    'openspec_sync_revisions',
    {
      description: 'Sync recorded revisions to design.md or proposal.md before archiving',
      inputSchema: {
        changeId: z.string().describe('Change ID'),
      },
    },
    async ({ changeId }) => {
      try {
        const result = await manager.syncToDocument(changeId);
        
        if (result.count === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No revisions to sync for "${changeId}".`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `✅ Synced ${result.count} revision(s) to ${result.targetFile}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

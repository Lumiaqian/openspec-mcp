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
        metadata: z.object({
          type: z.enum(['contract', 'behavior', 'internal']).describe('Type of deviation: contract (API signature), behavior (business logic), internal (implementation only)'),
          affectedAPI: z.string().optional().describe('Affected API endpoint (e.g., "GET /lite_effect/left_list")'),
          affectedField: z.string().optional().describe('Affected field in response (e.g., "voucher_list")'),
          updateTarget: z.array(z.enum(['specs', 'design', 'delta-specs'])).describe('Which documents to update'),
          source: z.object({
            file: z.string().describe('Source file path'),
            function: z.string().describe('Function name'),
          }).optional().describe('Related code location'),
        }).optional().describe('Revision metadata for tracking impact'),
      },
    },
    async ({ changeId, description, reason, metadata }) => {
      try {
        const revision = await manager.recordRevision(changeId, description, { reason, metadata });
        
        let output = `✅ Revision recorded for "${changeId}"\n\n**ID**: ${revision.id}\n**Description**: ${revision.description}\n**Reason**: ${revision.reason || '-'}\n**Time**: ${revision.createdAt}`;
        
        if (revision.metadata) {
          output += `\n**Type**: ${revision.metadata.type}`;
          if (revision.metadata.affectedAPI) {
            output += `\n**Affected API**: ${revision.metadata.affectedAPI}`;
          }
          if (revision.metadata.affectedField) {
            output += `\n**Affected Field**: ${revision.metadata.affectedField}`;
          }
          output += `\n**Update Target**: ${revision.metadata.updateTarget.join(', ')}`;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: output,
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
   * 更新设计变更
   * 用于修复错误或补充 metadata
   */
  server.registerTool(
    'openspec_update_revision',
    {
      description: 'Update an existing revision, usually to add metadata or correct information.',
      inputSchema: {
        changeId: z.string().describe('Change ID'),
        revisionId: z.string().describe('Revision ID (e.g., "rev-xxxxx")'),
        metadata: z.object({
          type: z.enum(['contract', 'behavior', 'internal']).describe('Type of deviation'),
          affectedAPI: z.string().optional().describe('Affected API endpoint'),
          affectedField: z.string().optional().describe('Affected field'),
          updateTarget: z.array(z.enum(['specs', 'design', 'delta-specs'])).describe('Which documents to update'),
          source: z.object({
            file: z.string().describe('Source file path'),
            function: z.string().describe('Function name'),
          }).optional().describe('Related code location'),
        }).optional().describe('Partial metadata update'),
      },
    },
    async ({ changeId, revisionId, metadata }) => {
      try {
        const revision = await manager.updateRevision(changeId, revisionId, { metadata });
        
        if (!revision) {
          return {
            content: [
              {
                type: 'text',
                text: `Revision "${revisionId}" not found in change "${changeId}".`,
              },
            ],
            isError: true,
          };
        }

        let output = `✅ Revision updated for "${changeId}"\n\n**ID**: ${revision.id}\n**Description**: ${revision.description}`;
        
        if (revision.metadata) {
          output += `\n\n**Metadata**:\n- Type: ${revision.metadata.type}`;
          if (revision.metadata.affectedAPI) output += `\n- API: ${revision.metadata.affectedAPI}`;
          output += `\n- Targets: ${revision.metadata.updateTarget.join(', ')}`;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: output,
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
        type: z.enum(['contract', 'behavior', 'internal']).optional().describe('Filter by revision type'),
        affectedAPI: z.string().optional().describe('Filter by affected API endpoint'),
      },
    },
    async ({ changeId, type, affectedAPI }) => {
      try {
        const revisions = await manager.listRevisions(changeId, { type, affectedAPI });
        
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
        output += '| Date | Type | Description | Reason | Affected API |\n';
        output += '|------|------|-------------|--------|--------------|\n';
        
        for (const rev of revisions) {
          const date = rev.createdAt.slice(0, 10);
          const revType = rev.metadata?.type || '-';
          const api = rev.metadata?.affectedAPI || '-';
          output += `| ${date} | ${revType} | ${rev.description} | ${rev.reason || '-'} | ${api} |\n`;
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

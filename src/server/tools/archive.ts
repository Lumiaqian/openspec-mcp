/**
 * Archive 类工具
 * 归档已完成的变更
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenSpecCli } from '../../core/openspec-cli.js';
import { RevisionManager } from '../../core/revision-manager.js';

export function registerArchiveTools(server: McpServer, cli: OpenSpecCli, revisionManager?: RevisionManager): void {
  /**
   * 归档变更
   */
  server.registerTool(
    'openspec_archive_change',
    {
      description: 'Archive a completed change proposal. Automatically syncs revisions to design.md before archiving.',
      inputSchema: {
        changeId: z.string().describe('Change ID to archive'),
        skipSpecs: z
          .boolean()
          .optional()
          .describe('Skip merging delta specs into main specs'),
      },
    },
    async ({ changeId, skipSpecs }) => {
      let revisionsSynced = 0;

      // 归档前：同步 revisions 到文档
      if (revisionManager) {
        try {
          const hasRevisions = await revisionManager.hasRevisions(changeId);
          if (hasRevisions) {
            const syncResult = await revisionManager.syncToDocument(changeId);
            revisionsSynced = syncResult.count;
            
            // 同步后删除 revisions.json
            await revisionManager.deleteRevisionsFile(changeId);
          }
        } catch {
          // 忽略 revision 同步错误，不阻止归档
        }
      }

      const result = await cli.archiveChange(changeId, { skipSpecs });

      if (result.success) {
        let message = `✅ Successfully archived change: ${changeId}\n\nArchived to: ${result.archivedPath}`;
        
        if (revisionsSynced > 0) {
          message += `\n\n📝 Synced ${revisionsSynced} revision(s) to document before archiving.`;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: message,
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

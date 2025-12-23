/**
 * Cross-Service Tools
 * MCP 工具：跨服务文档管理
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CrossServiceManager } from '../../core/cross-service-manager.js';
import type { CrossServiceDocument } from '../../types/openspec.js';

export function registerCrossServiceTools(
  server: McpServer,
  crossServiceManager: CrossServiceManager
): void {
  /**
   * 列出跨服务文档
   */
  server.registerTool(
    'openspec_list_cross_service_docs',
    {
      description: 'List cross-service documents for a change proposal. Returns documents defined in proposal.md frontmatter crossService config.',
      inputSchema: {
        changeId: z.string().describe('Change ID to get cross-service documents for'),
      },
    },
    async ({ changeId }) => {
      const info = await crossServiceManager.getCrossServiceInfo(changeId);

      if (!info) {
        return {
          content: [
            {
              type: 'text',
              text: `No cross-service configuration found for change: ${changeId}\n\nTo add cross-service documents, add the following to your proposal.md frontmatter:\n\n\`\`\`yaml\n---\ncrossService:\n  rootPath: "../../../../.cross-service"\n  documents:\n    - design.md\n    - flows.md\n---\n\`\`\``,
            },
          ],
        };
      }

      const docList = info.documents
        .map((doc) => {
          const snapshotLabel = doc.isSnapshot ? ' (snapshot)' : '';
          return `- ${doc.name}${snapshotLabel}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `📂 Cross-Service Documents for ${changeId}\n\nConfig:\n  Root Path: ${info.config.rootPath}\n  Archive Policy: ${info.config.archivePolicy || 'snapshot'}\n\nDocuments:\n${docList || '  (no documents found)'}`,
          },
        ],
      };
    }
  );

  /**
   * 读取单个跨服务文档
   */
  server.registerTool(
    'openspec_read_cross_service_doc',
    {
      description: 'Read a specific cross-service document content. Use openspec_list_cross_service_docs first to see available documents.',
      inputSchema: {
        changeId: z.string().describe('Change ID'),
        docName: z.string().describe('Document name (e.g., design.md, flows.md)'),
      },
    },
    async ({ changeId, docName }) => {
      const doc = await crossServiceManager.readDocument(changeId, docName);

      if (!doc) {
        return {
          content: [
            {
              type: 'text',
              text: `Document not found: ${docName}\n\nUse openspec_list_cross_service_docs to see available documents.`,
            },
          ],
          isError: true,
        };
      }

      const snapshotLabel = doc.isSnapshot ? ' (from archive snapshot)' : '';

      return {
        content: [
          {
            type: 'text',
            text: `📄 ${doc.name}${snapshotLabel}\nPath: ${doc.path}\n\n---\n\n${doc.content}`,
          },
        ],
      };
    }
  );
}

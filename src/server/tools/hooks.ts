/**
 * Hooks 类工具
 * Git hooks 管理
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HooksManager } from '../../core/hooks-manager.js';

export function registerHooksTools(server: McpServer, hooksManager: HooksManager): void {
  /**
   * 安装 Git hooks
   */
  server.registerTool(
    'openspec_setup_hooks',
    {
      description: 'Install or uninstall OpenSpec Git hooks',
      inputSchema: {
        action: z
          .enum(['install', 'uninstall', 'status'])
          .describe('Action to perform'),
      },
    },
    async ({ action }) => {
      if (action === 'status') {
        const isGit = await hooksManager.isGitRepo();
        if (!isGit) {
          return {
            content: [{ type: 'text', text: '❌ Not a Git repository' }],
            isError: true,
          };
        }

        const installed = await hooksManager.getInstalledHooks();
        let text = '📦 OpenSpec Hooks Status\n';
        text += '========================\n\n';
        
        if (installed.length > 0) {
          text += `Installed hooks:\n`;
          for (const hook of installed) {
            text += `  ✅ ${hook}\n`;
          }
        } else {
          text += `No OpenSpec hooks installed.\n`;
          text += `Run with action: install to set up hooks.\n`;
        }

        return { content: [{ type: 'text', text }] };
      }

      if (action === 'install') {
        const result = await hooksManager.install();
        
        if (result.success) {
          let text = '✅ OpenSpec hooks installed successfully!\n\n';
          text += `Installed:\n`;
          for (const hook of result.installed) {
            text += `  • ${hook}\n`;
          }
          text += `\nHooks will:\n`;
          text += `  • pre-commit: Validate tasks.md format\n`;
          text += `  • post-merge: Suggest archiving completed changes\n`;
          return { content: [{ type: 'text', text }] };
        } else {
          return {
            content: [{ type: 'text', text: `❌ Failed: ${result.error}` }],
            isError: true,
          };
        }
      }

      if (action === 'uninstall') {
        const result = await hooksManager.uninstall();
        
        if (result.success) {
          let text = '✅ OpenSpec hooks removed.\n\n';
          if (result.removed.length > 0) {
            text += `Removed:\n`;
            for (const hook of result.removed) {
              text += `  • ${hook}\n`;
            }
          } else {
            text += `No hooks were installed.\n`;
          }
          return { content: [{ type: 'text', text }] };
        } else {
          return {
            content: [{ type: 'text', text: `❌ Failed: ${result.error}` }],
            isError: true,
          };
        }
      }

      return {
        content: [{ type: 'text', text: 'Unknown action' }],
        isError: true,
      };
    }
  );
}

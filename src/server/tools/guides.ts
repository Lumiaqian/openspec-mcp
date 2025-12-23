/**
 * Guides 类工具
 * 提供 OpenSpec 使用指南和项目上下文
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenSpecCli } from '../../core/openspec-cli.js';

export function registerGuidesTools(server: McpServer, cli: OpenSpecCli): void {
  /**
   * 获取 OpenSpec 使用指南 (AGENTS.md)
   */
  server.registerTool(
    'openspec_get_instructions',
    {
      description: 'Get OpenSpec usage instructions from AGENTS.md',
      inputSchema: {},
    },
    async () => {
      const content = await cli.getInstructions();
      return {
        content: [{ type: 'text', text: content }],
      };
    }
  );

  /**
   * 获取项目上下文 (project.md)
   */
  server.registerTool(
    'openspec_get_project_context',
    {
      description: 'Get project context from project.md',
      inputSchema: {},
    },
    async () => {
      const content = await cli.getProjectContext();
      return {
        content: [{ type: 'text', text: content }],
      };
    }
  );
}

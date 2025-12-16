/**
 * Validation 类工具
 * 验证规格和变更
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenSpecCli } from '../../core/openspec-cli.js';

export function registerValidationTools(server: McpServer, cli: OpenSpecCli): void {
  /**
   * 验证单个变更
   */
  server.tool(
    'openspec_validate_change',
    'Validate a change proposal',
    {
      changeId: z.string().describe('Change ID to validate'),
      strict: z
        .boolean()
        .optional()
        .describe('Use strict validation mode'),
    },
    async ({ changeId, strict }) => {
      const result = await cli.validateChange(changeId, { strict });

      const statusText = result.valid ? '✅ Valid' : '❌ Invalid';
      let text = `${statusText}\n\nChange: ${changeId}\n`;

      if (result.errors.length > 0) {
        text += '\nErrors:\n';
        for (const error of result.errors) {
          const prefix = error.type === 'error' ? '❌' : '⚠️';
          text += `${prefix} ${error.message}\n`;
          if (error.location) {
            text += `   Location: ${error.location}\n`;
          }
        }
      }

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  /**
   * 验证单个规格
   */
  server.tool(
    'openspec_validate_spec',
    'Validate a specification',
    {
      specId: z.string().describe('Spec ID to validate'),
      strict: z
        .boolean()
        .optional()
        .describe('Use strict validation mode'),
    },
    async ({ specId, strict }) => {
      const result = await cli.validateSpec(specId, { strict });

      const statusText = result.valid ? '✅ Valid' : '❌ Invalid';
      let text = `${statusText}\n\nSpec: ${specId}\n`;

      if (result.errors.length > 0) {
        text += '\nErrors:\n';
        for (const error of result.errors) {
          const prefix = error.type === 'error' ? '❌' : '⚠️';
          text += `${prefix} ${error.message}\n`;
          if (error.location) {
            text += `   Location: ${error.location}\n`;
          }
        }
      }

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  /**
   * 批量验证
   */
  server.tool(
    'openspec_validate_all',
    'Validate all changes and/or specs',
    {
      type: z
        .enum(['changes', 'specs', 'all'])
        .optional()
        .default('all')
        .describe('What to validate: changes, specs, or all'),
      strict: z
        .boolean()
        .optional()
        .describe('Use strict validation mode'),
    },
    async ({ type, strict }) => {
      const results: { item: string; valid: boolean; errorCount: number }[] = [];

      // 验证变更
      if (type === 'changes' || type === 'all') {
        const changes = await cli.listChanges();
        for (const change of changes) {
          const result = await cli.validateChange(change.id, { strict });
          results.push({
            item: `change:${change.id}`,
            valid: result.valid,
            errorCount: result.errors.length,
          });
        }
      }

      // 验证规格
      if (type === 'specs' || type === 'all') {
        const specs = await cli.listSpecs();
        for (const spec of specs) {
          const result = await cli.validateSpec(spec.id, { strict });
          results.push({
            item: `spec:${spec.id}`,
            valid: result.valid,
            errorCount: result.errors.length,
          });
        }
      }

      // 汇总
      const validCount = results.filter((r) => r.valid).length;
      const invalidCount = results.filter((r) => !r.valid).length;

      let text = `Validation Summary\n`;
      text += `==================\n`;
      text += `✅ Valid: ${validCount}\n`;
      text += `❌ Invalid: ${invalidCount}\n`;
      text += `Total: ${results.length}\n\n`;

      if (invalidCount > 0) {
        text += `Invalid items:\n`;
        for (const r of results.filter((r) => !r.valid)) {
          text += `  - ${r.item} (${r.errorCount} errors)\n`;
        }
      }

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}

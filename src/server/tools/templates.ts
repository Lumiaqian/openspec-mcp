/**
 * Templates 类工具
 * 模板管理和 Change 创建
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TemplateManager } from '../../core/template-manager.js';

export function registerTemplatesTools(server: McpServer, templateManager: TemplateManager): void {
  /**
   * 列出所有可用模板
   */
  server.registerTool(
    'openspec_list_templates',
    {
      description: 'List all available change templates',
      inputSchema: {},
    },
    async () => {
      const templates = await templateManager.listTemplates();

      let text = `Available Templates\n`;
      text += `===================\n\n`;

      for (const template of templates) {
        text += `📄 ${template.name}\n`;
        text += `   ${template.description}\n`;
        text += `   Files: ${template.files.join(', ')}\n\n`;
      }

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  /**
   * 从模板创建新的 Change
   */
  server.registerTool(
    'openspec_create_change',
    {
      description: 'Create a new change from a template',
      inputSchema: {
        changeId: z
          .string()
          .describe('Change ID (kebab-case, e.g., add-user-auth)'),
        template: z
          .enum(['feature', 'bugfix', 'refactor'])
          .default('feature')
          .describe('Template to use'),
        title: z
          .string()
          .optional()
          .describe('Change title (defaults to changeId)'),
      },
    },
    async ({ changeId, template, title }) => {
      const result = await templateManager.createChange(changeId, { template, title });

      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `✅ Created change: ${changeId}\n\nTemplate: ${template}\nPath: ${result.path}\n\nFiles created:\n- proposal.md\n- tasks.md`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to create change: ${result.error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * 预览模板内容
   */
  server.registerTool(
    'openspec_preview_template',
    {
      description: 'Preview the content of a template',
      inputSchema: {
        template: z
          .enum(['feature', 'bugfix', 'refactor'])
          .describe('Template name'),
      },
    },
    async ({ template: templateName }) => {
      const template = await templateManager.getTemplate(templateName);

      if (!template) {
        return {
          content: [{ type: 'text', text: `Template not found: ${templateName}` }],
          isError: true,
        };
      }

      let text = `Template: ${templateName}\n`;
      text += `${'='.repeat(40)}\n\n`;
      text += `## proposal.md\n\`\`\`markdown\n${template.proposal}\`\`\`\n\n`;
      text += `## tasks.md\n\`\`\`markdown\n${template.tasks}\`\`\`\n`;

      if (template.design) {
        text += `\n## design.md\n\`\`\`markdown\n${template.design}\`\`\`\n`;
      }

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}

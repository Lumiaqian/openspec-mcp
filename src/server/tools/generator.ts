/**
 * Generator 类工具
 * AI 辅助生成 Proposal
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProposalGenerator } from '../../core/proposal-generator.js';

export function registerGeneratorTools(
  server: McpServer,
  proposalGenerator: ProposalGenerator
): void {
  /**
   * 准备生成 proposal（返回 prompt 供 AI 使用）
   */
  server.tool(
    'openspec_prepare_proposal',
    'Prepare context and prompt for generating a proposal from a requirement',
    {
      requirement: z
        .string()
        .describe('Description of the feature or change requirement'),
    },
    async ({ requirement }) => {
      const result = await proposalGenerator.prepareGeneration(requirement);

      let text = `# Proposal Generation Prepared\n\n`;
      text += `**Suggested Change ID**: \`${result.suggestedId}\`\n\n`;
      text += `## Context Gathered\n\n`;
      text += result.context || '_No project context found_';
      text += `\n\n## Generation Prompt\n\n`;
      text += `Use the following prompt to generate the proposal:\n\n`;
      text += '```\n' + result.prompt + '\n```\n';

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  /**
   * 保存生成的 proposal
   */
  server.tool(
    'openspec_save_proposal',
    'Save a generated proposal and tasks to a new change',
    {
      changeId: z
        .string()
        .describe('Change ID (kebab-case, e.g., add-user-auth)'),
      proposal: z.string().describe('Content of proposal.md'),
      tasks: z.string().describe('Content of tasks.md'),
    },
    async ({ changeId, proposal, tasks }) => {
      const result = await proposalGenerator.saveDraft(changeId, proposal, tasks);

      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `✅ Saved proposal to: ${result.path}\n\nCreated files:\n- proposal.md\n- tasks.md`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to save: ${result.error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * 一站式生成并保存（返回示例，需 AI 填充内容）
   */
  server.tool(
    'openspec_generate_proposal',
    'Generate a proposal from requirement description (returns template for AI to complete)',
    {
      requirement: z
        .string()
        .describe('Description of the feature or change requirement'),
      changeId: z
        .string()
        .optional()
        .describe('Optional custom change ID'),
    },
    async ({ requirement, changeId }) => {
      const preparation = await proposalGenerator.prepareGeneration(requirement);
      const finalId = changeId || preparation.suggestedId;

      // 生成模板（AI 应该替换这些内容）
      const proposalTemplate = `# ${requirement}

## Summary

[AI: Write a brief summary based on the requirement]

## Motivation

[AI: Explain why this change is needed]

## Proposed Solution

[AI: Describe the high-level solution]

## Impact

- [ ] Breaking changes: [AI: List any breaking changes]
- [ ] Dependencies: [AI: List affected dependencies]
`;

      const tasksTemplate = `# Tasks for ${requirement}

## 1. Planning

- [ ] **1.1** [AI: Add planning tasks]

## 2. Implementation

- [ ] **2.1** [AI: Add implementation tasks]
- [ ] **2.2** [AI: Add more tasks as needed]

## 3. Verification

- [ ] **3.1** [AI: Add verification tasks]
`;

      let text = `# Proposal Generation for: ${finalId}\n\n`;
      text += `## Suggested Change ID\n\n\`${finalId}\`\n\n`;
      text += `## Context\n\n${preparation.context || '_No project context_'}\n\n`;
      text += `## Template proposal.md\n\n\`\`\`markdown\n${proposalTemplate}\`\`\`\n\n`;
      text += `## Template tasks.md\n\n\`\`\`markdown\n${tasksTemplate}\`\`\`\n\n`;
      text += `---\n\n`;
      text += `**Next step**: Review and fill in the [AI: ...] placeholders, then use \`openspec_save_proposal\` to save.\n`;

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}

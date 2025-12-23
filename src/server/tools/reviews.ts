/**
 * Reviews 类工具
 * 评审意见管理
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReviewManager, ReviewTargetType, ReviewType, ReviewSeverity } from '../../core/review-manager.js';

export function registerReviewTools(server: McpServer, reviewManager: ReviewManager): void {
  /**
   * 添加评审意见
   */
  server.registerTool(
    'openspec_add_review',
    {
      description: 'Add a review comment to a change or spec',
      inputSchema: {
        targetType: z
          .enum(['proposal', 'design', 'spec', 'tasks'])
          .describe('Type of target to review'),
        targetId: z.string().describe('Change ID or Spec ID'),
        lineNumber: z.number().int().positive().optional().describe('Line number (optional)'),
        type: z
          .enum(['comment', 'suggestion', 'question', 'issue'])
          .describe('Type of review'),
        severity: z
          .enum(['low', 'medium', 'high'])
          .optional()
          .describe('Severity (for issues)'),
        body: z.string().describe('Review comment content'),
        suggestedChange: z.string().optional().describe('Suggested code change'),
        author: z.string().default('ai').describe('Author of the review'),
      },
    },
    async ({ targetType, targetId, lineNumber, type, severity, body, suggestedChange, author }) => {
      const review = await reviewManager.addReview({
        targetType: targetType as ReviewTargetType,
        targetId,
        lineNumber,
        type: type as ReviewType,
        severity: severity as ReviewSeverity | undefined,
        body,
        suggestedChange,
        author,
      });

      const typeIcon = {
        comment: '💬',
        suggestion: '💡',
        question: '❓',
        issue: '🚨',
      }[type];

      let text = `${typeIcon} Review added: ${review.id}\n\n`;
      text += `Target: ${targetType} / ${targetId}`;
      if (lineNumber) text += ` (line ${lineNumber})`;
      text += `\nType: ${type}`;
      if (severity) text += ` [${severity}]`;
      text += `\n\n${body}`;

      return { content: [{ type: 'text', text }] };
    }
  );

  /**
   * 列出评审意见
   */
  server.registerTool(
    'openspec_list_reviews',
    {
      description: 'List review comments for a change or spec',
      inputSchema: {
        targetType: z.enum(['proposal', 'design', 'spec', 'tasks']),
        targetId: z.string(),
        status: z.enum(['open', 'resolved', 'wont_fix']).optional(),
        type: z.enum(['comment', 'suggestion', 'question', 'issue']).optional(),
      },
    },
    async ({ targetType, targetId, status, type }) => {
      const reviews = await reviewManager.listReviews(
        targetType as ReviewTargetType,
        targetId,
        { status, type: type as ReviewType | undefined }
      );

      if (reviews.length === 0) {
        return { content: [{ type: 'text', text: `No reviews found for ${targetType}/${targetId}` }] };
      }

      let text = `Reviews for ${targetType}/${targetId}\n`;
      text += `${'='.repeat(40)}\n\n`;

      const typeIcons = { comment: '💬', suggestion: '💡', question: '❓', issue: '🚨' };
      const statusIcons = { open: '🔴', resolved: '✅', wont_fix: '⏭️' };

      for (const review of reviews) {
        text += `${statusIcons[review.status]} ${typeIcons[review.type]} [${review.id}]`;
        if (review.lineNumber) text += ` L${review.lineNumber}`;
        if (review.severity) text += ` (${review.severity})`;
        text += `\n`;
        text += `   ${review.body.substring(0, 100)}${review.body.length > 100 ? '...' : ''}\n`;
        if (review.replies.length > 0) {
          text += `   💭 ${review.replies.length} replies\n`;
        }
        text += `\n`;
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  /**
   * 回复评审意见
   */
  server.registerTool(
    'openspec_reply_review',
    {
      description: 'Reply to a review comment',
      inputSchema: {
        targetType: z.enum(['proposal', 'design', 'spec', 'tasks']),
        targetId: z.string(),
        reviewId: z.string(),
        body: z.string(),
        author: z.string().default('ai'),
      },
    },
    async ({ targetType, targetId, reviewId, body, author }) => {
      const reply = await reviewManager.addReply(
        targetType as ReviewTargetType,
        targetId,
        reviewId,
        author,
        body
      );

      if (!reply) {
        return {
          content: [{ type: 'text', text: `❌ Review ${reviewId} not found` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: `💭 Reply added to ${reviewId}` }],
      };
    }
  );

  /**
   * 解决评审意见
   */
  server.registerTool(
    'openspec_resolve_review',
    {
      description: 'Mark a review as resolved or won\'t fix',
      inputSchema: {
        targetType: z.enum(['proposal', 'design', 'spec', 'tasks']),
        targetId: z.string(),
        reviewId: z.string(),
        resolution: z.enum(['resolved', 'wont_fix']).default('resolved'),
        resolvedBy: z.string().default('user'),
      },
    },
    async ({ targetType, targetId, reviewId, resolution, resolvedBy }) => {
      const success = await reviewManager.resolveReview(
        targetType as ReviewTargetType,
        targetId,
        reviewId,
        resolvedBy,
        resolution
      );

      if (!success) {
        return {
          content: [{ type: 'text', text: `❌ Review ${reviewId} not found` }],
          isError: true,
        };
      }

      const icon = resolution === 'resolved' ? '✅' : '⏭️';
      return {
        content: [{ type: 'text', text: `${icon} Review ${reviewId} marked as ${resolution}` }],
      };
    }
  );

  /**
   * 获取评审统计
   */
  server.registerTool(
    'openspec_get_review_summary',
    {
      description: 'Get review summary for a change (all files)',
      inputSchema: {
        changeId: z.string().describe('Change ID'),
      },
    },
    async ({ changeId }) => {
      const { proposal, design, tasks, summary } = await reviewManager.getChangeReviews(changeId);

      let text = `Review Summary for: ${changeId}\n`;
      text += `${'='.repeat(40)}\n\n`;

      text += `📊 Overall: ${summary.total} reviews\n`;
      text += `   🔴 Open: ${summary.open}\n`;
      text += `   ✅ Resolved: ${summary.resolved}\n`;
      text += `   ⏭️ Won't Fix: ${summary.wontFix}\n\n`;

      text += `📁 By File:\n`;
      text += `   proposal.md: ${proposal.length}\n`;
      text += `   design.md: ${design.length}\n`;
      text += `   tasks.md: ${tasks.length}\n\n`;

      text += `📋 By Type:\n`;
      text += `   💬 Comments: ${summary.byType.comment}\n`;
      text += `   💡 Suggestions: ${summary.byType.suggestion}\n`;
      text += `   ❓ Questions: ${summary.byType.question}\n`;
      text += `   🚨 Issues: ${summary.byType.issue}\n\n`;

      if (summary.hasBlockingIssues) {
        text += `⚠️ Blocking issues exist! Cannot request approval.\n`;
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  /**
   * 检查审批准备状态
   */
  server.registerTool(
    'openspec_check_approval_readiness',
    {
      description: 'Check if a change is ready for approval',
      inputSchema: {
        changeId: z.string(),
      },
    },
    async ({ changeId }) => {
      const blockers = await reviewManager.checkApprovalReadiness(changeId);

      if (blockers.length === 0) {
        return {
          content: [{ type: 'text', text: `✅ Change ${changeId} is ready for approval!` }],
        };
      }

      let text = `❌ Change ${changeId} is NOT ready for approval:\n\n`;
      for (const blocker of blockers) {
        text += `   • ${blocker}\n`;
      }
      text += `\nResolve these issues before requesting approval.`;

      return {
        content: [{ type: 'text', text }],
        isError: true,
      };
    }
  );
}

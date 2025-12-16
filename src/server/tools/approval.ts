/**
 * Approval 类工具
 * 审批流程管理
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApprovalManager } from '../../core/approval-manager.js';

export function registerApprovalTools(
  server: McpServer,
  approvalManager: ApprovalManager
): void {
  /**
   * 获取审批状态
   */
  server.tool(
    'openspec_get_approval_status',
    'Get approval status for a change',
    {
      changeId: z.string().describe('Change ID'),
    },
    async ({ changeId }) => {
      const record = await approvalManager.getApprovalStatus(changeId);

      if (!record) {
        return {
          content: [
            {
              type: 'text',
              text: `No approval record found for: ${changeId}\n\nUse openspec_request_approval to start the approval process.`,
            },
          ],
        };
      }

      // 格式化输出
      let text = `Approval Status: ${changeId}\n`;
      text += `========================\n\n`;
      text += `Status: ${formatStatus(record.status)}\n`;

      if (record.requestedAt) {
        text += `Requested: ${record.requestedAt}\n`;
        text += `Requested by: ${record.requestedBy || 'unknown'}\n`;
      }

      if (record.reviewers && record.reviewers.length > 0) {
        text += `Reviewers: ${record.reviewers.join(', ')}\n`;
      }

      if (record.approvals.length > 0) {
        text += `\nApprovals:\n`;
        for (const approval of record.approvals) {
          text += `  ✅ ${approval.approver} at ${approval.approvedAt}\n`;
          if (approval.comment) {
            text += `     Comment: ${approval.comment}\n`;
          }
        }
      }

      if (record.rejections.length > 0) {
        text += `\nRejections:\n`;
        for (const rejection of record.rejections) {
          text += `  ❌ ${rejection.rejector} at ${rejection.rejectedAt}\n`;
          text += `     Reason: ${rejection.reason}\n`;
        }
      }

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  /**
   * 请求审批
   */
  server.tool(
    'openspec_request_approval',
    'Request approval for a change',
    {
      changeId: z.string().describe('Change ID'),
      requestedBy: z.string().describe('Who is requesting approval'),
      reviewers: z
        .array(z.string())
        .optional()
        .describe('List of reviewers'),
    },
    async ({ changeId, requestedBy, reviewers }) => {
      try {
        const record = await approvalManager.requestApproval(
          changeId,
          requestedBy,
          reviewers
        );

        let text = `✅ Approval requested for: ${changeId}\n\n`;
        text += `Status: ${formatStatus(record.status)}\n`;
        text += `Requested by: ${requestedBy}\n`;

        if (reviewers && reviewers.length > 0) {
          text += `Reviewers: ${reviewers.join(', ')}\n`;
        }

        return {
          content: [{ type: 'text', text }],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to request approval: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * 审批通过
   */
  server.tool(
    'openspec_approve_change',
    'Approve a change',
    {
      changeId: z.string().describe('Change ID'),
      approver: z.string().describe('Who is approving'),
      comment: z.string().optional().describe('Optional approval comment'),
    },
    async ({ changeId, approver, comment }) => {
      try {
        const record = await approvalManager.approve(changeId, approver, comment);

        let text = `✅ Change approved: ${changeId}\n\n`;
        text += `Approved by: ${approver}\n`;
        text += `Status: ${formatStatus(record.status)}\n`;

        if (comment) {
          text += `Comment: ${comment}\n`;
        }

        return {
          content: [{ type: 'text', text }],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to approve: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * 审批拒绝
   */
  server.tool(
    'openspec_reject_change',
    'Reject a change',
    {
      changeId: z.string().describe('Change ID'),
      rejector: z.string().describe('Who is rejecting'),
      reason: z.string().describe('Rejection reason'),
    },
    async ({ changeId, rejector, reason }) => {
      try {
        const record = await approvalManager.reject(changeId, rejector, reason);

        let text = `❌ Change rejected: ${changeId}\n\n`;
        text += `Rejected by: ${rejector}\n`;
        text += `Reason: ${reason}\n`;
        text += `Status: ${formatStatus(record.status)}\n`;

        return {
          content: [{ type: 'text', text }],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to reject: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * 列出待审批的变更
   */
  server.tool(
    'openspec_list_pending_approvals',
    'List all changes pending approval',
    {},
    async () => {
      const pending = await approvalManager.listPendingApprovals();

      if (pending.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No pending approvals.\n\nAll changes are either approved, rejected, or not yet submitted for approval.`,
            },
          ],
        };
      }

      let text = `Pending Approvals\n`;
      text += `=================\n\n`;

      for (const record of pending) {
        text += `📋 ${record.changeId}\n`;
        text += `   Requested: ${record.requestedAt}\n`;
        text += `   By: ${record.requestedBy || 'unknown'}\n`;

        if (record.reviewers && record.reviewers.length > 0) {
          text += `   Reviewers: ${record.reviewers.join(', ')}\n`;
        }

        text += `\n`;
      }

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}

/**
 * 格式化状态显示
 */
function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    draft: '📝 Draft',
    pending_approval: '⏳ Pending Approval',
    approved: '✅ Approved',
    rejected: '❌ Rejected',
    implementing: '🔧 Implementing',
    completed: '🎉 Completed',
  };
  return statusMap[status] || status;
}

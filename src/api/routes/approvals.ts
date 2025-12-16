/**
 * Approvals REST API 路由
 */

import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../server.js';

export function registerApprovalsRoutes(fastify: FastifyInstance, ctx: ApiContext): void {
  const { approvalManager } = ctx;

  /**
   * GET /api/approvals - 列出所有审批记录
   */
  fastify.get('/approvals', async () => {
    const approvals = await approvalManager.listApprovals();
    return { approvals };
  });

  /**
   * GET /api/approvals/pending - 列出待审批记录
   */
  fastify.get('/approvals/pending', async () => {
    const approvals = await approvalManager.listPendingApprovals();
    return { approvals };
  });

  /**
   * GET /api/approvals/:changeId - 获取审批状态
   */
  fastify.get('/approvals/:changeId', async (request, reply) => {
    const { changeId } = request.params as { changeId: string };
    const record = await approvalManager.getApprovalStatus(changeId);

    if (!record) {
      return reply.status(404).send({ error: 'Approval record not found' });
    }

    return { approval: record };
  });

  /**
   * POST /api/approvals/:changeId/request - 请求审批
   */
  fastify.post('/approvals/:changeId/request', async (request, reply) => {
    const { changeId } = request.params as { changeId: string };
    const { requestedBy, reviewers } = request.body as {
      requestedBy: string;
      reviewers?: string[];
    };

    if (!requestedBy) {
      return reply.status(400).send({ error: 'requestedBy is required' });
    }

    try {
      const record = await approvalManager.requestApproval(changeId, requestedBy, reviewers);
      ctx.broadcast('approval:requested', { changeId, record });
      return { approval: record };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * POST /api/approvals/:changeId/approve - 审批通过
   */
  fastify.post('/approvals/:changeId/approve', async (request, reply) => {
    const { changeId } = request.params as { changeId: string };
    const { approver, comment } = request.body as {
      approver: string;
      comment?: string;
    };

    if (!approver) {
      return reply.status(400).send({ error: 'approver is required' });
    }

    try {
      const record = await approvalManager.approve(changeId, approver, comment);
      ctx.broadcast('approval:approved', { changeId, record });
      return { approval: record };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * POST /api/approvals/:changeId/reject - 审批拒绝
   */
  fastify.post('/approvals/:changeId/reject', async (request, reply) => {
    const { changeId } = request.params as { changeId: string };
    const { rejector, reason } = request.body as {
      rejector: string;
      reason: string;
    };

    if (!rejector || !reason) {
      return reply.status(400).send({ error: 'rejector and reason are required' });
    }

    try {
      const record = await approvalManager.reject(changeId, rejector, reason);
      ctx.broadcast('approval:rejected', { changeId, record });
      return { approval: record };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * DELETE /api/approvals/:changeId - 删除审批记录
   */
  fastify.delete('/approvals/:changeId', async (request, reply) => {
    const { changeId } = request.params as { changeId: string };

    const deleted = await approvalManager.deleteApproval(changeId);

    if (deleted) {
      return { success: true };
    } else {
      return reply.status(404).send({ error: 'Approval record not found' });
    }
  });
}

/**
 * Changes REST API 路由
 */

import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../server.js';

export function registerChangesRoutes(fastify: FastifyInstance, ctx: ApiContext): void {
  const { cli } = ctx;

  /**
   * GET /api/changes - 列出所有变更
   */
  fastify.get('/changes', async (request, reply) => {
    const { includeArchived } = request.query as { includeArchived?: string };
    const changes = await cli.listChanges({
      includeArchived: includeArchived === 'true',
    });
    return { changes };
  });

  /**
   * GET /api/changes/:id - 获取变更详情
   */
  fastify.get('/changes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const change = await cli.showChange(id);

    if (!change) {
      return reply.status(404).send({ error: 'Change not found' });
    }

    return { change };
  });

  /**
   * POST /api/changes/:id/validate - 验证变更
   */
  fastify.post('/changes/:id/validate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { strict?: boolean };
    const { strict } = body;

    const result = await cli.validateChange(id, { strict });
    return result;
  });

  /**
   * POST /api/changes/:id/archive - 归档变更
   */
  fastify.post('/changes/:id/archive', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { skipSpecs?: boolean };
    const { skipSpecs } = body;

    const result = await cli.archiveChange(id, { skipSpecs });

    if (result.success) {
      // 广播归档事件
      ctx.broadcast('change:archived', { changeId: id, archivedPath: result.archivedPath });
      return result;
    } else {
      return reply.status(400).send(result);
    }
  });

  /**
   * GET /api/changes/:id/reviews - 获取 Change 的所有 reviews
   */
  fastify.get('/changes/:id/reviews', async (request) => {
    const { id } = request.params as { id: string };
    const { reviewManager } = ctx;

    const result = await reviewManager.getChangeReviews(id);
    return result;
  });

  /**
   * POST /api/changes/:id/reviews - 添加 review 到 Change
   */
  fastify.post('/changes/:id/reviews', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { targetType, lineNumber, type, severity, body: reviewBody, author } = request.body as {
      targetType: 'proposal' | 'design' | 'tasks';
      lineNumber?: number;
      type: 'comment' | 'suggestion' | 'question' | 'issue';
      severity?: 'low' | 'medium' | 'high';
      body: string;
      author?: string;
    };

    if (!reviewBody || !type || !targetType) {
      return reply.status(400).send({ error: 'body, type, and targetType are required' });
    }

    try {
      const { reviewManager } = ctx;
      const review = await reviewManager.addReview({
        targetType,
        targetId: id,
        lineNumber,
        type,
        severity,
        body: reviewBody,
        author: author || 'user',
      });

      ctx.broadcast('review:added', { changeId: id, targetType, review }, 'reviews');
      return { review };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add review';
      return reply.status(400).send({ error: message });
    }
  });

  /**
   * PATCH /api/changes/:id/reviews/:reviewId - 解决 review
   */
  fastify.patch('/changes/:id/reviews/:reviewId', async (request, reply) => {
    const { id, reviewId } = request.params as { id: string; reviewId: string };
    const { targetType, status, resolvedBy } = request.body as {
      targetType: 'proposal' | 'design' | 'tasks';
      status: 'resolved' | 'wont_fix';
      resolvedBy?: string;
    };

    if (!['resolved', 'wont_fix'].includes(status) || !targetType) {
      return reply.status(400).send({ error: 'Invalid status or missing targetType' });
    }

    const { reviewManager } = ctx;
    const success = await reviewManager.resolveReview(targetType, id, reviewId, resolvedBy || 'user', status);
    
    if (!success) {
      return reply.status(404).send({ error: 'Review not found' });
    }

    ctx.broadcast('review:resolved', { changeId: id, targetType, reviewId, status }, 'reviews');
    return { success: true };
  });
}

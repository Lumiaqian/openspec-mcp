/**
 * Specs REST API 路由
 */

import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../server.js';
import type { ReviewTargetType, ReviewType, ReviewSeverity } from '../../core/review-manager.js';

export function registerSpecsRoutes(fastify: FastifyInstance, ctx: ApiContext): void {
  const { cli, reviewManager, specParser } = ctx;

  /**
   * GET /api/specs - 列出所有规格
   */
  fastify.get('/specs', async () => {
    const specs = await cli.listSpecs();
    return { specs };
  });

  /**
   * GET /api/specs/:id - 获取规格详情
   */
  fastify.get('/specs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const spec = await cli.showSpec(id);

    if (!spec) {
      return reply.status(404).send({ error: 'Spec not found' });
    }

    return { spec };
  });

  /**
   * POST /api/specs/:id/validate - 验证规格
   */
  fastify.post('/specs/:id/validate', async (request) => {
    const { id } = request.params as { id: string };
    const { strict } = request.body as { strict?: boolean };

    const result = await cli.validateSpec(id, { strict });
    return result;
  });

  /**
   * GET /api/specs/dependencies - 获取 Spec 依赖图
   */
  fastify.get('/specs/dependencies', async () => {
    const graph = await specParser.buildDependencyGraph();
    const mermaid = await specParser.toMermaid();

    return {
      graph,
      mermaid,
    };
  });

  /**
   * GET /api/specs/:id/dependencies - 获取单个 Spec 的依赖链
   */
  fastify.get('/specs/:id/dependencies', async (request) => {
    const { id } = request.params as { id: string };

    const directDeps = await specParser.parseDependencies(id);
    const allDeps = await specParser.getDependencyChain(id);

    return {
      specId: id,
      direct: directDeps,
      transitive: allDeps.filter((d) => !directDeps.includes(d)),
      all: allDeps,
    };
  });

  /**
   * Reviews API for Specs
   */

  /**
   * GET /api/specs/:id/reviews - 列出 Spec 的评审意见
   */
  fastify.get('/specs/:id/reviews', async (request) => {
    const { id } = request.params as { id: string };
    const { status, type } = request.query as { status?: string; type?: string };

    const reviews = await reviewManager.listReviews('spec', id, {
      status: status as 'open' | 'resolved' | 'wont_fix' | undefined,
      type: type as ReviewType | undefined,
    });

    return { reviews };
  });

  /**
   * POST /api/specs/:id/reviews - 添加 Spec 评审意见
   */
  fastify.post('/specs/:id/reviews', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { lineNumber, type, severity, body, suggestedChange, author } = request.body as {
      lineNumber?: number;
      type: ReviewType;
      severity?: ReviewSeverity;
      body: string;
      suggestedChange?: string;
      author?: string;
    };

    if (!body || !type) {
      return reply.status(400).send({ error: 'body and type are required' });
    }

    try {
      const review = await reviewManager.addReview({
        targetType: 'spec',
        targetId: id,
        lineNumber,
        type,
        severity,
        body,
        suggestedChange,
        author: author || 'user',
      });

      ctx.broadcast('review:added', { targetType: 'spec', targetId: id, review }, 'reviews');
      return { review };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add review';
      return reply.status(400).send({ error: message });
    }
  });

  /**
   * POST /api/specs/:id/reviews/:reviewId/reply - 回复评审
   */
  fastify.post('/specs/:id/reviews/:reviewId/reply', async (request, reply) => {
    const { id, reviewId } = request.params as { id: string; reviewId: string };
    const { body, author } = request.body as { body: string; author?: string };

    if (!body) {
      return reply.status(400).send({ error: 'body is required' });
    }

    const result = await reviewManager.addReply('spec', id, reviewId, author || 'user', body);
    
    if (!result) {
      return reply.status(404).send({ error: 'Review not found' });
    }

    return { reply: result };
  });

  /**
   * PATCH /api/specs/:id/reviews/:reviewId - 解决评审
   */
  fastify.patch('/specs/:id/reviews/:reviewId', async (request, reply) => {
    const { id, reviewId } = request.params as { id: string; reviewId: string };
    const { status, resolvedBy } = request.body as {
      status: 'resolved' | 'wont_fix';
      resolvedBy?: string;
    };

    if (!['resolved', 'wont_fix'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid status' });
    }

    const success = await reviewManager.resolveReview('spec', id, reviewId, resolvedBy || 'user', status);
    
    if (!success) {
      return reply.status(404).send({ error: 'Review not found' });
    }

    ctx.broadcast('review:resolved', { targetType: 'spec', targetId: id, reviewId, status }, 'reviews');
    return { success: true };
  });
}

/**
 * Specs REST API 路由
 */

import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../server.js';

export function registerSpecsRoutes(fastify: FastifyInstance, ctx: ApiContext): void {
  const { cli } = ctx;

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
}

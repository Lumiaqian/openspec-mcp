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
}

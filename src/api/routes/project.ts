/**
 * Project REST API 路由
 */

import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../server.js';

export function registerProjectRoutes(fastify: FastifyInstance, ctx: ApiContext): void {
  const { cli } = ctx;

  /**
   * GET /api/project - 获取项目名称
   */
  fastify.get('/project', async () => {
    const project = await cli.getProjectName();
    return { project };
  });
}

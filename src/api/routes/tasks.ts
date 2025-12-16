/**
 * Tasks REST API 路由
 */

import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../server.js';

export function registerTasksRoutes(fastify: FastifyInstance, ctx: ApiContext): void {
  const { cli } = ctx;

  /**
   * GET /api/changes/:id/tasks - 获取变更的任务列表
   */
  fastify.get('/changes/:id/tasks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await cli.getTasks(id);
    return result;
  });

  /**
   * PATCH /api/changes/:id/tasks/:taskId - 更新任务状态
   */
  fastify.patch('/changes/:id/tasks/:taskId', async (request, reply) => {
    const { id, taskId } = request.params as { id: string; taskId: string };
    const { status } = request.body as { status: 'pending' | 'in_progress' | 'done' };

    if (!status || !['pending', 'in_progress', 'done'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid status' });
    }

    const result = await cli.updateTaskStatus(id, taskId, status);

    if (result.success) {
      // 广播任务更新事件
      ctx.broadcast('task:updated', { changeId: id, taskId, status });
      return { success: true, taskId, status };
    } else {
      return reply.status(400).send(result);
    }
  });

  /**
   * GET /api/progress - 获取所有变更的进度汇总
   */
  fastify.get('/progress', async () => {
    const changes = await cli.listChanges();
    const summaries = [];

    for (const change of changes) {
      const { progress } = await cli.getTasks(change.id);
      summaries.push({
        changeId: change.id,
        title: change.title,
        progress,
      });
    }

    // 计算总体进度
    const totalTasks = summaries.reduce((sum, s) => sum + s.progress.total, 0);
    const completedTasks = summaries.reduce((sum, s) => sum + s.progress.completed, 0);
    const overallPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      summaries,
      overall: {
        total: totalTasks,
        completed: completedTasks,
        percentage: overallPercentage,
      },
    };
  });
}

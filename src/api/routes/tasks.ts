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

  /**
   * POST /api/changes/:id/tasks/batch - 批量更新任务状态
   */
  fastify.post('/changes/:id/tasks/batch', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { updates } = request.body as {
      updates: Array<{ taskId: string; status: 'pending' | 'in_progress' | 'done' }>;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      return reply.status(400).send({ error: 'updates array is required' });
    }

    const results: { taskId: string; success: boolean; error?: string }[] = [];

    for (const update of updates) {
      if (!['pending', 'in_progress', 'done'].includes(update.status)) {
        results.push({ taskId: update.taskId, success: false, error: 'Invalid status' });
        continue;
      }

      const result = await cli.updateTaskStatus(id, update.taskId, update.status);
      results.push({
        taskId: update.taskId,
        success: result.success,
        error: result.error,
      });
    }

    const successCount = results.filter((r) => r.success).length;

    // 广播批量更新事件
    ctx.broadcast('tasks:batch_updated', { changeId: id, results });

    return {
      changeId: id,
      total: updates.length,
      success: successCount,
      failed: updates.length - successCount,
      results,
    };
  });
}

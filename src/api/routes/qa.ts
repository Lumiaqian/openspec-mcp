/**
 * QA REST API 路由
 * 提供 QA Runner 的 REST 接口
 */

import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../server.js';
import { QARunner, QACheckType } from '../../core/qa-runner.js';

export function registerQARoutes(fastify: FastifyInstance, ctx: ApiContext): void {
  // 创建 QARunner 实例
  const qaRunner = new QARunner({ cwd: ctx.cwd });

  /**
   * GET /api/qa/status/:changeName - 获取指定变更的 QA 状态
   */
  fastify.get('/qa/status/:changeName', async (request) => {
    const { changeName } = request.params as { changeName: string };
    const status = await qaRunner.getQAStatus(changeName);
    return { status };
  });

  /**
   * GET /api/qa/history/:changeName - 获取指定变更的 QA 历史
   */
  fastify.get('/qa/history/:changeName', async (request) => {
    const { changeName } = request.params as { changeName: string };
    const { limit } = request.query as { limit?: string };
    
    const history = await qaRunner.getQAHistory(
      changeName,
      limit ? parseInt(limit, 10) : 10
    );
    
    return { history };
  });

  /**
   * GET /api/qa/summary - 获取所有变更的 QA 摘要统计
   */
  fastify.get('/qa/summary', async () => {
    const summary = await qaRunner.getQASummary();
    return summary;
  });

  /**
   * POST /api/qa/run/:changeName - 触发指定变更的 QA 运行
   */
  fastify.post('/qa/run/:changeName', async (request, reply) => {
    const { changeName } = request.params as { changeName: string };
    const { checks } = request.body as { 
      checks?: QACheckType[];
    };
    
    // 检查是否已有运行中的 QA
    if (qaRunner.isRunning(changeName)) {
      return reply.status(409).send({ 
        error: 'A QA check is already running for this change',
        changeName
      });
    }
    
    // 异步运行 QA，立即返回
    const runPromise = qaRunner.runQA(changeName, { checks });
    
    // 广播开始事件
    ctx.broadcast('qa:started', { changeName, checks });
    
    // 后台处理结果
    runPromise.then(result => {
      ctx.broadcast('qa:completed', { 
        changeName, 
        status: result.status,
        summary: result.summary
      });
    }).catch(error => {
      ctx.broadcast('qa:error', { 
        changeName, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    });
    
    return { 
      message: 'QA check started',
      changeName,
      checks: checks || ['typecheck', 'lint', 'test']
    };
  });

  /**
   * POST /api/qa/stop/:changeName - 停止运行中的 QA
   */
  fastify.post('/qa/stop/:changeName', async (request, reply) => {
    const { changeName } = request.params as { changeName: string };
    
    if (!qaRunner.isRunning(changeName)) {
      return reply.status(400).send({ 
        error: 'No QA check is currently running for this change',
        changeName
      });
    }
    
    const stopped = await qaRunner.stopQA(changeName);
    
    if (stopped) {
      ctx.broadcast('qa:stopped', { changeName });
      return { message: 'QA check stopped', changeName };
    } else {
      return reply.status(500).send({ error: 'Failed to stop QA check' });
    }
  });

  /**
   * GET /api/qa/running - 获取所有正在运行的 QA
   */
  fastify.get('/qa/running', async () => {
    const summary = await qaRunner.getQASummary();
    const running = summary.changes.filter(c => c.status === 'running');
    return { running };
  });
}

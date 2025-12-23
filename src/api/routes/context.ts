/**
 * Context REST API 路由
 * 提供项目上下文分析的 REST 接口
 */

import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../server.js';
import { ContextAnalyzer } from '../../core/context-analyzer.js';

export function registerContextRoutes(fastify: FastifyInstance, ctx: ApiContext): void {
  // 创建 ContextAnalyzer 实例
  const analyzer = new ContextAnalyzer({ cwd: ctx.cwd });

  /**
   * GET /api/context/analyze - 分析项目上下文
   */
  fastify.get('/context/analyze', async (request) => {
    const { refresh } = request.query as { refresh?: string };
    
    const context = refresh === 'true' 
      ? await analyzer.refreshContext()
      : await analyzer.analyze();
    
    return context;
  });

  /**
   * GET /api/context/summary - 获取项目上下文摘要
   */
  fastify.get('/context/summary', async () => {
    const cached = await analyzer.getCachedContext();
    
    if (!cached) {
      return { summary: null };
    }
    
    const languages = cached.stack.languages
      .slice(0, 3)
      .map(l => `${l.name} (${l.percentage}%)`)
      .join(', ');
    
    const summary = {
      projectName: cached.projectName,
      languages,
      frameworks: cached.stack.frameworks.join(', ') || 'None detected',
      packageManager: cached.stack.packageManager,
      testFramework: cached.stack.testFramework || 'None detected',
      architecture: cached.patterns.architecture,
      totalFiles: cached.stats.totalFiles,
      totalLines: cached.stats.totalLines,
      analyzedAt: cached.analyzedAt,
    };
    
    return { summary };
  });
}

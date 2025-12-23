/**
 * Kanban REST API 路由
 * 提供看板视图的后端支持
 */

import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../server.js';

// 审批状态对应的看板列
type KanbanColumn = 'draft' | 'pending_approval' | 'approved' | 'implementing' | 'completed' | 'archived';

interface KanbanCard {
  id: string;
  name: string;
  description?: string;
  progress: number;
  column: KanbanColumn;
  labels: string[];
  priority?: 'high' | 'medium' | 'low';
  updatedAt: string;
  createdAt: string;
}

interface KanbanData {
  columns: Array<{
    id: KanbanColumn;
    title: string;
    color: string;
    cards: KanbanCard[];
  }>;
  summary: {
    total: number;
    byColumn: Record<KanbanColumn, number>;
  };
}

// 列定义
const COLUMN_DEFINITIONS: Array<{ id: KanbanColumn; title: string; color: string }> = [
  { id: 'draft', title: 'Draft', color: '#6b7280' },
  { id: 'pending_approval', title: 'Pending', color: '#f59e0b' },
  { id: 'approved', title: 'Approved', color: '#10b981' },
  { id: 'implementing', title: 'Implementing', color: '#3b82f6' },
  { id: 'completed', title: 'Completed', color: '#8b5cf6' },
  { id: 'archived', title: 'Archived', color: '#9ca3af' },
];

// 状态到列的映射
function statusToColumn(status?: string, isArchived?: boolean): KanbanColumn {
  if (isArchived) return 'archived';
  
  const mapping: Record<string, KanbanColumn> = {
    draft: 'draft',
    pending_approval: 'pending_approval',
    approved: 'approved',
    rejected: 'draft', // 拒绝后回到 draft
    implementing: 'implementing',
    completed: 'completed',
  };
  
  return mapping[status || 'draft'] || 'draft';
}

export function registerKanbanRoutes(fastify: FastifyInstance, ctx: ApiContext): void {
  const { cli, approvalManager } = ctx;

  /**
   * GET /api/kanban - 获取看板数据
   */
  fastify.get('/kanban', async () => {
    // 获取所有变更（包括归档）
    const changes = await cli.listChanges({ includeArchived: true });
    
    // 构建看板数据
    const kanban: KanbanData = {
      columns: COLUMN_DEFINITIONS.map(col => ({
        ...col,
        cards: [],
      })),
      summary: {
        total: changes.length,
        byColumn: {
          draft: 0,
          pending_approval: 0,
          approved: 0,
          implementing: 0,
          completed: 0,
          archived: 0,
        },
      },
    };

    // 分类变更到各列
    for (const change of changes) {
      // 获取审批状态
      let approvalStatus: string | undefined;
      try {
        const approval = await approvalManager.getApprovalStatus(change.id);
        approvalStatus = approval?.status;
      } catch {
        // 忽略错误
      }
      
      const isArchived = change.status === 'archived';
      const column = statusToColumn(approvalStatus, isArchived);
      
      // 计算进度百分比
      const progress = change.tasksTotal > 0 
        ? Math.round((change.tasksCompleted / change.tasksTotal) * 100) 
        : 0;
      
      const card: KanbanCard = {
        id: change.id,
        name: change.title || change.id,
        description: undefined,
        progress,
        column,
        labels: [],
        priority: undefined,
        updatedAt: change.updatedAt || new Date().toISOString(),
        createdAt: change.createdAt || new Date().toISOString(),
      };
      
      // 添加标签
      if (progress === 100) card.labels.push('complete');
      if (change.tasksTotal > 0) card.labels.push('has-tasks');
      
      // 添加到对应列
      const colIndex = kanban.columns.findIndex(c => c.id === column);
      if (colIndex >= 0) {
        kanban.columns[colIndex].cards.push(card);
        kanban.summary.byColumn[column]++;
      }
    }
    
    // 按更新时间排序每列的卡片
    for (const col of kanban.columns) {
      col.cards.sort((a: KanbanCard, b: KanbanCard) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }
    
    return kanban;
  });

  /**
   * PUT /api/kanban/:id/move - 移动卡片到新列
   */
  fastify.put('/kanban/:id/move', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { toColumn, note } = request.body as { toColumn: KanbanColumn; note?: string };
    
    if (!COLUMN_DEFINITIONS.some(c => c.id === toColumn)) {
      return reply.status(400).send({ error: 'Invalid column' });
    }
    
    // 根据目标列确定操作
    try {
      switch (toColumn) {
        case 'pending_approval':
          // 请求审批
          await approvalManager.requestApproval(id, 'user', note ? [note] : undefined);
          break;
          
        case 'approved':
          // 批准变更
          await approvalManager.approve(id, 'user', note);
          break;
          
        case 'draft':
          // 退回到草稿
          await approvalManager.resetToDraft(id, 'user');
          break;
          
        case 'implementing':
          // 开始实施
          await approvalManager.startImplementation(id, 'user');
          break;
          
        case 'completed':
          // 标记完成
          await approvalManager.markCompleted(id, 'user');
          break;
          
        case 'archived':
          // 归档
          const result = await cli.archiveChange(id);
          if (!result.success) {
            return reply.status(400).send({ error: result.error });
          }
          break;
      }
      
      // 广播更新
      ctx.broadcast('kanban:updated', { changeId: id, toColumn }, 'kanban');
      
      return { success: true, changeId: id, newColumn: toColumn };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move card';
      return reply.status(400).send({ error: message });
    }
  });

  /**
   * GET /api/kanban/summary - 获取看板统计摘要
   */
  fastify.get('/kanban/summary', async () => {
    const changes = await cli.listChanges({ includeArchived: true });
    
    const summary: Record<KanbanColumn, number> = {
      draft: 0,
      pending_approval: 0,
      approved: 0,
      implementing: 0,
      completed: 0,
      archived: 0,
    };
    
    for (const change of changes) {
      let approvalStatus: string | undefined;
      try {
        const approval = await approvalManager.getApprovalStatus(change.id);
        approvalStatus = approval?.status;
      } catch {
        // 忽略
      }
      
      const isArchived = change.status === 'archived';
      const column = statusToColumn(approvalStatus, isArchived);
      summary[column]++;
    }
    
    return {
      total: changes.length,
      columns: summary,
    };
  });
}

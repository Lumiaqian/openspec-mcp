/**
 * Tasks 类工具
 * 任务追踪和进度管理
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenSpecCli } from '../../core/openspec-cli.js';
import type { ProgressSummary } from '../../types/openspec.js';

export function registerTasksTools(server: McpServer, cli: OpenSpecCli): void {
  /**
   * 获取变更的任务列表和进度
   */
  server.tool(
    'openspec_get_tasks',
    'Get tasks and progress for a change',
    {
      changeId: z.string().describe('Change ID'),
    },
    async ({ changeId }) => {
      const { tasks, progress } = await cli.getTasks(changeId);

      // 格式化输出
      let text = `Tasks for: ${changeId}\n`;
      text += `========================\n\n`;
      text += `Progress: ${progress.percentage}% (${progress.completed}/${progress.total})\n`;
      text += `  ✅ Completed: ${progress.completed}\n`;
      text += `  🔄 In Progress: ${progress.inProgress}\n`;
      text += `  ⏳ Pending: ${progress.pending}\n\n`;

      if (tasks.length > 0) {
        text += `Tasks:\n`;
        let currentSection = '';

        for (const task of tasks) {
          if (task.section !== currentSection) {
            currentSection = task.section;
            text += `\n### ${currentSection}\n`;
          }

          const statusIcon =
            task.status === 'done' ? '✅' : task.status === 'in_progress' ? '🔄' : '⏳';
          text += `${statusIcon} [${task.id}] ${task.title}\n`;
        }
      } else {
        text += `No tasks found.\n`;
      }

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  /**
   * 更新任务状态
   */
  server.tool(
    'openspec_update_task',
    'Update task status',
    {
      changeId: z.string().describe('Change ID'),
      taskId: z.string().describe('Task ID (e.g., 1.1, 2.3)'),
      status: z
        .enum(['pending', 'in_progress', 'done'])
        .describe('New status'),
    },
    async ({ changeId, taskId, status }) => {
      const result = await cli.updateTaskStatus(changeId, taskId, status);

      if (result.success) {
        const statusIcon =
          status === 'done' ? '✅' : status === 'in_progress' ? '🔄' : '⏳';
        return {
          content: [
            {
              type: 'text',
              text: `${statusIcon} Task ${taskId} updated to: ${status}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to update task: ${result.error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * 获取所有变更的进度汇总
   */
  server.tool(
    'openspec_get_progress_summary',
    'Get progress summary for all changes',
    {},
    async () => {
      const changes = await cli.listChanges();
      const summaries: ProgressSummary[] = [];

      for (const change of changes) {
        const { progress } = await cli.getTasks(change.id);
        summaries.push({
          changeId: change.id,
          title: change.title,
          progress,
        });
      }

      // 格式化输出
      let text = `Progress Summary\n`;
      text += `================\n\n`;

      if (summaries.length === 0) {
        text += `No active changes found.\n`;
      } else {
        // 按进度排序
        summaries.sort((a, b) => b.progress.percentage - a.progress.percentage);

        for (const summary of summaries) {
          const bar = renderProgressBar(summary.progress.percentage);
          text += `${summary.title}\n`;
          text += `  ${bar} ${summary.progress.percentage}%\n`;
          text += `  (${summary.progress.completed}/${summary.progress.total} tasks)\n\n`;
        }

        // 总体统计
        const totalTasks = summaries.reduce((sum, s) => sum + s.progress.total, 0);
        const completedTasks = summaries.reduce(
          (sum, s) => sum + s.progress.completed,
          0
        );
        const overallPercentage =
          totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        text += `---\n`;
        text += `Overall: ${completedTasks}/${totalTasks} tasks (${overallPercentage}%)\n`;
      }

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  /**
   * 批量更新任务状态
   */
  server.tool(
    'openspec_batch_update_tasks',
    'Batch update multiple task statuses in a change',
    {
      changeId: z.string().describe('Change ID'),
      updates: z
        .array(
          z.object({
            taskId: z.string().describe('Task ID (e.g., 1.1, 2.3)'),
            status: z.enum(['pending', 'in_progress', 'done']).describe('New status'),
          })
        )
        .describe('Array of task updates'),
    },
    async ({ changeId, updates }) => {
      const results: { taskId: string; success: boolean; error?: string }[] = [];

      for (const update of updates) {
        const result = await cli.updateTaskStatus(changeId, update.taskId, update.status);
        results.push({
          taskId: update.taskId,
          success: result.success,
          error: result.error,
        });
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.length - successCount;

      let text = `Batch Update Results for: ${changeId}\n`;
      text += `==============================\n\n`;
      text += `✅ Success: ${successCount}\n`;
      if (failCount > 0) {
        text += `❌ Failed: ${failCount}\n\n`;
        text += `Failures:\n`;
        for (const r of results.filter((r) => !r.success)) {
          text += `  - Task ${r.taskId}: ${r.error}\n`;
        }
      }

      return {
        content: [{ type: 'text', text }],
        isError: failCount > 0,
      };
    }
  );
}

/**
 * 渲染进度条
 */
function renderProgressBar(percentage: number): string {
  const total = 20;
  const filled = Math.round((percentage / 100) * total);
  const empty = total - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}


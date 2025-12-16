/**
 * 任务解析器
 * 解析 tasks.md 文件中的任务列表
 */

import * as fs from 'fs/promises';
import type { Task, Progress, TaskStatus } from '../types/openspec.js';

export class TaskParser {
  /**
   * 解析 tasks.md 文件
   *
   * 支持格式：
   * - [ ] 待完成
   * - [x] 已完成
   * - [-] 进行中
   *
   * 任务 ID 格式：
   * - **1.1** 任务描述
   * - **2.3.1** 子任务描述
   */
  async parseTasks(tasksPath: string): Promise<Task[]> {
    const content = await fs.readFile(tasksPath, 'utf-8');
    return this.parseTasksFromContent(content);
  }

  /**
   * 从内容解析任务
   */
  parseTasksFromContent(content: string): Task[] {
    const lines = content.split('\n');
    const tasks: Task[] = [];
    let currentSection = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // 检测章节标题 (## 或 ###)
      const sectionMatch = line.match(/^#{2,3}\s+(.+)/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        continue;
      }

      // 检测任务项 - 支持多种格式
      // 格式1: - [x] **1.1** 任务描述
      // 格式2: - [ ] **1.1** 任务描述
      // 格式3: - [-] **1.1** 任务描述
      const taskMatch = line.match(
        /^(\s*)-\s+\[([ x-])\]\s+\*\*(\d+(?:\.\d+)*)\*\*\s+(.+)/
      );

      if (taskMatch) {
        const [, indent, statusChar, id, title] = taskMatch;
        const depth = Math.floor(indent.length / 2); // 计算嵌套层级

        tasks.push({
          id,
          section: currentSection,
          title: title.trim(),
          status: this.parseStatus(statusChar),
          line: lineNum,
        });
        continue;
      }

      // 检测简单任务项（无 ID）
      // 格式: - [ ] 任务描述
      const simpleTaskMatch = line.match(/^(\s*)-\s+\[([ x-])\]\s+(.+)/);
      if (simpleTaskMatch && !simpleTaskMatch[3].startsWith('**')) {
        const [, indent, statusChar, title] = simpleTaskMatch;

        // 为简单任务生成一个基于行号的 ID
        tasks.push({
          id: `line-${lineNum}`,
          section: currentSection,
          title: title.trim(),
          status: this.parseStatus(statusChar),
          line: lineNum,
        });
      }
    }

    return tasks;
  }

  /**
   * 解析状态字符
   */
  private parseStatus(char: string): TaskStatus {
    switch (char) {
      case 'x':
        return 'done';
      case '-':
        return 'in_progress';
      default:
        return 'pending';
    }
  }

  /**
   * 获取状态字符
   */
  private getStatusChar(status: TaskStatus): string {
    switch (status) {
      case 'done':
        return 'x';
      case 'in_progress':
        return '-';
      default:
        return ' ';
    }
  }

  /**
   * 计算进度
   */
  calculateProgress(tasks: Task[]): Progress {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'done').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const pending = tasks.filter((t) => t.status === 'pending').length;

    return {
      total,
      completed,
      inProgress,
      pending,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(
    tasksPath: string,
    taskId: string,
    newStatus: TaskStatus
  ): Promise<void> {
    const content = await fs.readFile(tasksPath, 'utf-8');
    const lines = content.split('\n');
    const statusChar = this.getStatusChar(newStatus);
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      // 匹配带 ID 的任务
      const taskMatch = lines[i].match(
        /^(\s*-\s+\[)([ x-])(\]\s+\*\*)(\d+(?:\.\d+)*)(\*\*.+)/
      );

      if (taskMatch && taskMatch[4] === taskId) {
        lines[i] = `${taskMatch[1]}${statusChar}${taskMatch[3]}${taskMatch[4]}${taskMatch[5]}`;
        found = true;
        break;
      }

      // 匹配基于行号的任务 ID
      if (taskId === `line-${i + 1}`) {
        const simpleMatch = lines[i].match(/^(\s*-\s+\[)([ x-])(\]\s+.+)/);
        if (simpleMatch) {
          lines[i] = `${simpleMatch[1]}${statusChar}${simpleMatch[3]}`;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      throw new Error(`Task ${taskId} not found`);
    }

    await fs.writeFile(tasksPath, lines.join('\n'), 'utf-8');
  }

  /**
   * 批量更新任务状态
   */
  async batchUpdateTaskStatus(
    tasksPath: string,
    updates: { taskId: string; status: TaskStatus }[]
  ): Promise<void> {
    const content = await fs.readFile(tasksPath, 'utf-8');
    let lines = content.split('\n');

    for (const { taskId, status } of updates) {
      const statusChar = this.getStatusChar(status);

      for (let i = 0; i < lines.length; i++) {
        const taskMatch = lines[i].match(
          /^(\s*-\s+\[)([ x-])(\]\s+\*\*)(\d+(?:\.\d+)*)(\*\*.+)/
        );

        if (taskMatch && taskMatch[4] === taskId) {
          lines[i] = `${taskMatch[1]}${statusChar}${taskMatch[3]}${taskMatch[4]}${taskMatch[5]}`;
          break;
        }

        if (taskId === `line-${i + 1}`) {
          const simpleMatch = lines[i].match(/^(\s*-\s+\[)([ x-])(\]\s+.+)/);
          if (simpleMatch) {
            lines[i] = `${simpleMatch[1]}${statusChar}${simpleMatch[3]}`;
            break;
          }
        }
      }
    }

    await fs.writeFile(tasksPath, lines.join('\n'), 'utf-8');
  }
}

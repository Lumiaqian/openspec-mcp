/**
 * OpenSpec CLI 包装器
 * 通过调用 openspec CLI 命令获取数据
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  Change,
  ChangeDetail,
  Spec,
  SpecDetail,
  ValidationResult,
  Task,
  Progress,
} from '../types/openspec.js';
import { TaskParser } from './task-parser.js';

const execAsync = promisify(exec);

export interface OpenSpecCliOptions {
  cwd?: string;
}

export class OpenSpecCli {
  private cwd: string;
  private taskParser: TaskParser;

  constructor(options?: OpenSpecCliOptions) {
    this.cwd = options?.cwd || process.cwd();
    this.taskParser = new TaskParser();
  }

  /**
   * 获取 openspec 目录路径
   */
  private getOpenSpecDir(): string {
    return path.join(this.cwd, 'openspec');
  }

  /**
   * 检查 openspec 是否已初始化
   */
  async isInitialized(): Promise<boolean> {
    try {
      await fs.access(this.getOpenSpecDir());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取 AGENTS.md 内容（使用指南）
   */
  async getInstructions(): Promise<string> {
    const agentsPath = path.join(this.getOpenSpecDir(), 'AGENTS.md');
    try {
      return await fs.readFile(agentsPath, 'utf-8');
    } catch {
      return 'AGENTS.md not found. Run `openspec init` to initialize.';
    }
  }

  /**
   * 获取 project.md 内容（项目上下文）
   */
  async getProjectContext(): Promise<string> {
    const projectPath = path.join(this.getOpenSpecDir(), 'project.md');
    try {
      return await fs.readFile(projectPath, 'utf-8');
    } catch {
      return 'project.md not found. Run `openspec init` to initialize.';
    }
  }

  /**
   * 列出所有变更
   */
  async listChanges(options?: { includeArchived?: boolean }): Promise<Change[]> {
    const changesDir = path.join(this.getOpenSpecDir(), 'changes');
    const changes: Change[] = [];

    try {
      const entries = await fs.readdir(changesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // 跳过 archive 目录（除非指定包含）
        if (entry.name === 'archive') {
          if (options?.includeArchived) {
            const archivedChanges = await this.listArchivedChanges();
            changes.push(...archivedChanges);
          }
          continue;
        }

        const changeDir = path.join(changesDir, entry.name);
        const change = await this.parseChangeDir(entry.name, changeDir, 'active');
        if (change) {
          changes.push(change);
        }
      }
    } catch (error) {
      // 目录不存在，返回空数组
    }

    return changes;
  }

  /**
   * 列出已归档的变更
   */
  private async listArchivedChanges(): Promise<Change[]> {
    const archiveDir = path.join(this.getOpenSpecDir(), 'changes', 'archive');
    const changes: Change[] = [];

    try {
      const entries = await fs.readdir(archiveDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const changeDir = path.join(archiveDir, entry.name);
        const change = await this.parseChangeDir(entry.name, changeDir, 'archived');
        if (change) {
          changes.push(change);
        }
      }
    } catch {
      // archive 目录不存在
    }

    return changes;
  }

  /**
   * 解析变更目录
   */
  private async parseChangeDir(
    id: string,
    changeDir: string,
    status: 'active' | 'archived'
  ): Promise<Change | null> {
    try {
      const proposalPath = path.join(changeDir, 'proposal.md');
      const tasksPath = path.join(changeDir, 'tasks.md');

      // 读取 proposal 获取标题
      let title = id;
      try {
        const proposal = await fs.readFile(proposalPath, 'utf-8');
        const titleMatch = proposal.match(/^#\s+(.+)/m);
        if (titleMatch) {
          title = titleMatch[1].trim();
        }
      } catch {
        // 没有 proposal.md
      }

      // 读取 tasks 获取进度
      let tasksCompleted = 0;
      let tasksTotal = 0;
      try {
        const tasks = await this.taskParser.parseTasks(tasksPath);
        const progress = this.taskParser.calculateProgress(tasks);
        tasksCompleted = progress.completed;
        tasksTotal = progress.total;
      } catch {
        // 没有 tasks.md
      }

      // 获取文件修改时间
      const stats = await fs.stat(changeDir);

      return {
        id,
        title,
        status,
        tasksCompleted,
        tasksTotal,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }

  /**
   * 显示变更详情
   */
  async showChange(
    changeId: string,
    options?: { deltasOnly?: boolean }
  ): Promise<ChangeDetail | null> {
    // 先在活跃变更中查找
    let changeDir = path.join(this.getOpenSpecDir(), 'changes', changeId);

    try {
      await fs.access(changeDir);
    } catch {
      // 在归档中查找
      const archiveDir = path.join(this.getOpenSpecDir(), 'changes', 'archive');
      try {
        const archives = await fs.readdir(archiveDir);
        const match = archives.find((a) => a.endsWith(changeId) || a === changeId);
        if (match) {
          changeDir = path.join(archiveDir, match);
        } else {
          return null;
        }
      } catch {
        return null;
      }
    }

    const change = await this.parseChangeDir(
      changeId,
      changeDir,
      changeDir.includes('archive') ? 'archived' : 'active'
    );

    if (!change) return null;

    // 读取 proposal
    let proposal = '';
    try {
      proposal = await fs.readFile(path.join(changeDir, 'proposal.md'), 'utf-8');
    } catch {
      // 没有 proposal.md
    }

    // 读取 design (可选)
    let design: string | undefined;
    try {
      design = await fs.readFile(path.join(changeDir, 'design.md'), 'utf-8');
    } catch {
      // 没有 design.md
    }

    // 读取 tasks
    let tasks: Task[] = [];
    try {
      const tasksPath = path.join(changeDir, 'tasks.md');
      tasks = await this.taskParser.parseTasks(tasksPath);
    } catch {
      // 没有 tasks.md
    }

    // 读取 deltas (specs 目录下的变更)
    const deltas: any[] = [];
    const specsDir = path.join(changeDir, 'specs');
    try {
      const specDirs = await fs.readdir(specsDir, { withFileTypes: true });
      for (const specDir of specDirs) {
        if (!specDir.isDirectory()) continue;

        const specPath = path.join(specsDir, specDir.name, 'spec.md');
        try {
          const content = await fs.readFile(specPath, 'utf-8');
          deltas.push({
            specName: specDir.name,
            content,
          });
        } catch {
          // 没有 spec.md
        }
      }
    } catch {
      // 没有 specs 目录
    }

    return {
      ...change,
      proposal,
      design,
      tasks,
      deltas,
    };
  }

  /**
   * 列出所有规格
   */
  async listSpecs(): Promise<Spec[]> {
    const specsDir = path.join(this.getOpenSpecDir(), 'specs');
    const specs: Spec[] = [];

    try {
      const entries = await fs.readdir(specsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const specPath = path.join(specsDir, entry.name, 'spec.md');
        try {
          const content = await fs.readFile(specPath, 'utf-8');
          const stats = await fs.stat(specPath);

          // 解析标题
          const titleMatch = content.match(/^#\s+(.+)/m);
          const title = titleMatch ? titleMatch[1].trim() : entry.name;

          // 计算需求数量
          const requirementsMatch = content.match(/###\s+Requirement:/g);
          const requirementsCount = requirementsMatch ? requirementsMatch.length : 0;

          specs.push({
            id: entry.name,
            title,
            requirementsCount,
            updatedAt: stats.mtime.toISOString(),
          });
        } catch {
          // 没有 spec.md
        }
      }
    } catch {
      // specs 目录不存在
    }

    return specs;
  }

  /**
   * 显示规格详情
   */
  async showSpec(specId: string): Promise<SpecDetail | null> {
    const specPath = path.join(this.getOpenSpecDir(), 'specs', specId, 'spec.md');

    try {
      const content = await fs.readFile(specPath, 'utf-8');
      const stats = await fs.stat(specPath);

      // 解析标题
      const titleMatch = content.match(/^#\s+(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : specId;

      // 计算需求数量
      const requirementsMatch = content.match(/###\s+Requirement:/g);
      const requirementsCount = requirementsMatch ? requirementsMatch.length : 0;

      return {
        id: specId,
        title,
        requirementsCount,
        updatedAt: stats.mtime.toISOString(),
        content,
        requirements: [], // TODO: 详细解析需求
      };
    } catch {
      return null;
    }
  }

  /**
   * 验证变更
   */
  async validateChange(
    changeId: string,
    options?: { strict?: boolean }
  ): Promise<ValidationResult> {
    try {
      const flags = options?.strict ? '--strict' : '';
      await execAsync(`openspec validate ${changeId} ${flags}`, { cwd: this.cwd });
      return { valid: true, errors: [] };
    } catch (error: any) {
      // 解析错误输出
      const errors: any[] = [];
      const output = error.stderr || error.stdout || '';

      // 简单解析错误信息
      const lines = output.split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        if (line.includes('Error') || line.includes('error')) {
          errors.push({ type: 'error', message: line.trim() });
        } else if (line.includes('Warning') || line.includes('warning')) {
          errors.push({ type: 'warning', message: line.trim() });
        }
      }

      return { valid: false, errors };
    }
  }

  /**
   * 验证规格
   */
  async validateSpec(
    specId: string,
    options?: { strict?: boolean }
  ): Promise<ValidationResult> {
    try {
      const flags = options?.strict ? '--strict' : '';
      await execAsync(`openspec spec validate ${specId} ${flags}`, { cwd: this.cwd });
      return { valid: true, errors: [] };
    } catch (error: any) {
      const errors: any[] = [];
      const output = error.stderr || error.stdout || '';

      const lines = output.split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        if (line.includes('Error') || line.includes('error')) {
          errors.push({ type: 'error', message: line.trim() });
        } else if (line.includes('Warning') || line.includes('warning')) {
          errors.push({ type: 'warning', message: line.trim() });
        }
      }

      return { valid: false, errors };
    }
  }

  /**
   * 归档变更
   */
  async archiveChange(
    changeId: string,
    options?: { skipSpecs?: boolean }
  ): Promise<{ success: boolean; archivedPath: string; error?: string }> {
    try {
      const flags = options?.skipSpecs ? '--skip-specs --yes' : '--yes';
      const { stdout, stderr } = await execAsync(`openspec archive ${changeId} ${flags}`, { cwd: this.cwd });

      const date = new Date().toISOString().slice(0, 10);
      const archivedPath = `openspec/changes/archive/${date}-${changeId}`;

      // 验证归档目录是否存在
      const fullPath = path.join(this.cwd, archivedPath);
      try {
        await fs.access(fullPath);
        return { success: true, archivedPath };
      } catch {
        // 归档目录不存在，说明归档失败
        const errorOutput = stderr || stdout || 'Archive command did not create the archive directory';
        return {
          success: false,
          archivedPath: '',
          error: errorOutput,
        };
      }
    } catch (error: any) {
      // 提取 stderr 信息
      const errorMsg = error.stderr || error.stdout || error.message || 'Archive failed';
      return {
        success: false,
        archivedPath: '',
        error: errorMsg,
      };
    }
  }

  /**
   * 获取变更的任务列表
   */
  async getTasks(changeId: string): Promise<{ tasks: Task[]; progress: Progress }> {
    const changeDir = path.join(this.getOpenSpecDir(), 'changes', changeId);
    const tasksPath = path.join(changeDir, 'tasks.md');

    try {
      const tasks = await this.taskParser.parseTasks(tasksPath);
      const progress = this.taskParser.calculateProgress(tasks);
      return { tasks, progress };
    } catch {
      return {
        tasks: [],
        progress: {
          total: 0,
          completed: 0,
          inProgress: 0,
          pending: 0,
          percentage: 0,
        },
      };
    }
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(
    changeId: string,
    taskId: string,
    status: 'pending' | 'in_progress' | 'done'
  ): Promise<{ success: boolean; error?: string }> {
    const changeDir = path.join(this.getOpenSpecDir(), 'changes', changeId);
    const tasksPath = path.join(changeDir, 'tasks.md');

    try {
      await this.taskParser.updateTaskStatus(tasksPath, taskId, status);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

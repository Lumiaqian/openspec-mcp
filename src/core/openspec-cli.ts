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
  ValidationError,
  Task,
  Progress,
  CrossServiceInfo,
} from '../types/openspec.js';
import { TaskParser } from './task-parser.js';
import { CrossServiceManager } from './cross-service-manager.js';
import matter from 'gray-matter';

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
   * 校验 ID 参数，防止路径遍历攻击
   */
  private ensureSafeId(id: string, type: 'change' | 'spec'): string {
    const trimmed = id.trim();
    if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
      throw new Error(`Invalid ${type} id: ${id}`);
    }
    return trimmed;
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
   * 获取项目名称
   * 优先级: git remote > package.json/go.mod > 目录名 > project.md
   */
  async getProjectName(): Promise<{ name: string; source: 'git' | 'package.json' | 'go.mod' | 'cwd' | 'project.md' }> {
    // 1. 尝试从 git remote 获取项目名
    try {
      const { execSync } = await import('child_process');
      const remoteUrl = execSync('git remote get-url origin', { 
        cwd: this.cwd, 
        encoding: 'utf-8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      
      // 解析 git URL: https://github.com/user/repo.git 或 git@github.com:user/repo.git
      const match = remoteUrl.match(/[/:]([^/:]+?)(?:\.git)?$/);
      if (match) {
        return { name: match[1], source: 'git' };
      }
    } catch {
      // git 可能不可用或不是 git 仓库
    }

    // 2. 尝试从 package.json 获取
    try {
      const packagePath = path.join(this.cwd, 'package.json');
      const content = await fs.readFile(packagePath, 'utf-8');
      const data = JSON.parse(content) as { name?: string };
      if (data.name) {
        return { name: String(data.name), source: 'package.json' };
      }
    } catch {
      // package.json 可能不存在
    }

    // 3. 尝试从 go.mod 获取
    try {
      const goModPath = path.join(this.cwd, 'go.mod');
      const content = await fs.readFile(goModPath, 'utf-8');
      const match = content.match(/^module\s+(.+)/m);
      if (match) {
        // 取模块路径的最后一段作为名称
        const moduleName = match[1].trim().split('/').pop();
        if (moduleName) {
          return { name: moduleName, source: 'go.mod' };
        }
      }
    } catch {
      // go.mod 可能不存在
    }

    // 4. 使用当前目录名
    const dirName = path.basename(this.cwd);
    if (dirName && dirName !== '.' && dirName !== '/') {
      return { name: dirName, source: 'cwd' };
    }

    // 5. 最后尝试 project.md（最低优先级）
    try {
      const projectPath = path.join(this.getOpenSpecDir(), 'project.md');
      const content = await fs.readFile(projectPath, 'utf-8');
      const headingMatch = content.match(/^#\s+(.+)/m);
      if (headingMatch) {
        return { name: headingMatch[1].trim(), source: 'project.md' };
      }
    } catch {
      // project.md 可能不存在
    }

    return { name: 'Unknown Project', source: 'cwd' };
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
    changeId = this.ensureSafeId(changeId, 'change');
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

    // 读取 proposal（使用 gray-matter 移除 frontmatter）
    let proposal = '';
    try {
      const proposalRaw = await fs.readFile(path.join(changeDir, 'proposal.md'), 'utf-8');
      const { content } = matter(proposalRaw);
      proposal = content;
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

    // 读取跨服务文档
    let crossService: CrossServiceInfo | undefined;
    try {
      const crossServiceManager = new CrossServiceManager({ cwd: this.cwd });
      crossService = await crossServiceManager.getCrossServiceInfo(changeId) || undefined;
    } catch {
      // 无跨服务配置
    }

    return {
      ...change,
      proposal,
      design,
      tasks,
      deltas,
      crossService,
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
    specId = this.ensureSafeId(specId, 'spec');
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
    changeId = this.ensureSafeId(changeId, 'change');
    try {
      const flags = options?.strict ? '--strict' : '';
      await execAsync(`openspec validate ${changeId} ${flags}`, { cwd: this.cwd });
      return { valid: true, errors: [] };
    } catch (error: any) {
      // 解析错误输出
      const errors: ValidationError[] = [];
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
      const errors: ValidationError[] = [];
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
    changeId = this.ensureSafeId(changeId, 'change');
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
    changeId = this.ensureSafeId(changeId, 'change');
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

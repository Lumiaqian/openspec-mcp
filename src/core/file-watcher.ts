/**
 * 文件监控器
 * 使用 Chokidar 监控 openspec 目录变化
 */

import chokidar, { FSWatcher } from 'chokidar';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface FileWatcherOptions {
  cwd: string;
}

export class FileWatcher extends EventEmitter {
  private cwd: string;
  private watcher: FSWatcher | null = null;
  private crossServicePaths: Set<string> = new Set();

  constructor(options: FileWatcherOptions) {
    super();
    this.cwd = options.cwd;
  }

  /**
   * 获取监控目录路径
   */
  private getWatchPath(): string {
    return path.join(this.cwd, 'openspec');
  }

  /**
   * 启动监控
   */
  async start(): Promise<void> {
    const watchPath = this.getWatchPath();

    this.watcher = chokidar.watch(watchPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 10,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (filePath) => {
        this.handleChange('add', filePath);
      })
      .on('change', (filePath) => {
        this.handleChange('change', filePath);
      })
      .on('unlink', (filePath) => {
        this.handleChange('unlink', filePath);
      })
      .on('addDir', (filePath) => {
        this.handleChange('addDir', filePath);
      })
      .on('unlinkDir', (filePath) => {
        this.handleChange('unlinkDir', filePath);
      })
      .on('error', (error) => {
        console.error('File watcher error:', error);
        this.emit('error', error);
      })
      .on('ready', () => {
        console.log(`File watcher ready: ${watchPath}`);
        this.emit('ready');
      });
  }

  /**
   * 添加跨服务目录监控
   */
  addCrossServicePath(crossServicePath: string): void {
    if (this.crossServicePaths.has(crossServicePath)) {
      return;
    }

    this.crossServicePaths.add(crossServicePath);

    if (this.watcher) {
      this.watcher.add(crossServicePath);
      console.log(`Added cross-service path to watcher: ${crossServicePath}`);
    }
  }

  /**
   * 处理文件变化
   */
  private handleChange(event: string, filePath: string): void {
    // 获取相对路径
    const relativePath = path.relative(this.cwd, filePath);

    // 解析文件类型
    const fileType = this.getFileType(relativePath);

    console.log(`[${event}] ${relativePath} (${fileType})`);

    // 发射事件
    this.emit('change', event, {
      path: relativePath,
      absolutePath: filePath,
      type: fileType,
      timestamp: new Date().toISOString(),
    });

    // 发射特定类型事件
    this.emit(`change:${fileType}`, event, relativePath);
  }

  /**
   * 获取文件类型
   */
  private getFileType(relativePath: string): string {
    // 检查是否为跨服务文件
    for (const csPath of this.crossServicePaths) {
      if (relativePath.includes('.cross-service') || relativePath.includes('cross-service')) {
        if (relativePath.endsWith('services.yaml') || relativePath.endsWith('services.yml')) {
          return 'cross-service:services';
        }
        if (relativePath.endsWith('design.md')) {
          return 'cross-service:design';
        }
        if (relativePath.endsWith('flows.md')) {
          return 'cross-service:flows';
        }
        return 'cross-service';
      }
    }

    if (relativePath.includes('openspec/specs/')) {
      return 'spec';
    }
    if (relativePath.includes('openspec/changes/archive/')) {
      return 'archive';
    }
    if (relativePath.includes('openspec/reviews/')) {
      // Extract target type from path: reviews/changes/{changeId}/{targetType}.json
      if (relativePath.includes('/changes/')) {
        const match = relativePath.match(/\/changes\/([^/]+)\/(\w+)\.json$/);
        if (match) {
          return `review:${match[2]}`; // review:proposal, review:design, review:tasks
        }
      }
      if (relativePath.includes('/specs/')) {
        return 'review:spec';
      }
      return 'review';
    }
    if (relativePath.includes('openspec/changes/')) {
      if (relativePath.endsWith('proposal.md')) return 'proposal';
      if (relativePath.endsWith('design.md')) return 'design';
      if (relativePath.endsWith('tasks.md')) return 'tasks';
      if (relativePath.includes('/specs/')) return 'delta';
      return 'change';
    }
    if (relativePath.includes('openspec/approvals/')) {
      return 'approval';
    }
    if (relativePath.endsWith('AGENTS.md')) {
      return 'agents';
    }
    if (relativePath.endsWith('project.md')) {
      return 'project';
    }
    return 'other';
  }

  /**
   * 停止监控
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      console.log('File watcher stopped');
    }
  }

  /**
   * 是否正在监控
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }
}

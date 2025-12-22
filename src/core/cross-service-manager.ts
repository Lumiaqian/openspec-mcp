/**
 * Cross-Service Manager
 * 管理跨服务文档的解析、读取和快照
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import type {
  CrossServiceConfig,
  CrossServiceDocument,
  CrossServiceInfo,
} from '../types/openspec.js';

export interface CrossServiceManagerOptions {
  cwd?: string;
}

export class CrossServiceManager {
  private cwd: string;

  constructor(options?: CrossServiceManagerOptions) {
    this.cwd = options?.cwd || process.cwd();
  }

  /**
   * 获取 openspec 目录路径
   */
  private getOpenSpecDir(): string {
    return path.join(this.cwd, 'openspec');
  }

  /**
   * 检查文件是否存在
   */
  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 从 proposal.md 解析 crossService 配置
   */
  async parseConfig(proposalPath: string): Promise<CrossServiceConfig | null> {
    try {
      const content = await fs.readFile(proposalPath, 'utf-8');
      const { data } = matter(content);

      if (!data.crossService) {
        return null;
      }

      const config = data.crossService as Partial<CrossServiceConfig>;

      // 验证必填字段
      if (!config.rootPath || !Array.isArray(config.documents)) {
        return null;
      }

      return {
        rootPath: config.rootPath,
        documents: config.documents,
        archivePolicy: config.archivePolicy || 'snapshot',
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取 change 目录路径
   */
  private async getChangeDir(changeId: string): Promise<string | null> {
    // 先在活跃变更中查找
    let changeDir = path.join(this.getOpenSpecDir(), 'changes', changeId);

    if (await this.exists(changeDir)) {
      return changeDir;
    }

    // 在归档中查找
    const archiveDir = path.join(this.getOpenSpecDir(), 'changes', 'archive');
    try {
      const archives = await fs.readdir(archiveDir);
      const match = archives.find((a) => a.endsWith(changeId) || a === changeId);
      if (match) {
        return path.join(archiveDir, match);
      }
    } catch {
      // 归档目录不存在
    }

    return null;
  }

  /**
   * 判断路径是否安全（防止路径遍历攻击）
   */
  private isPathSafe(basePath: string, targetPath: string): boolean {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedBase = path.resolve(basePath);

    // 允许访问父目录中的 .cross-service（worktree 场景）
    // 但不允许无限向上遍历
    const relativeFromCwd = path.relative(this.cwd, resolvedTarget);
    const upLevels = (relativeFromCwd.match(/\.\.\//g) || []).length;

    // 最多允许向上 5 级（足够覆盖 worktree 场景）
    return upLevels <= 5;
  }

  /**
   * 列出所有跨服务文档
   */
  async listDocuments(changeId: string): Promise<CrossServiceDocument[]> {
    const changeDir = await this.getChangeDir(changeId);
    if (!changeDir) {
      return [];
    }

    const proposalPath = path.join(changeDir, 'proposal.md');
    const config = await this.parseConfig(proposalPath);
    if (!config) {
      return [];
    }

    // 判断是否为归档目录
    const isArchived = changeDir.includes('/archive/');
    const snapshotDir = path.join(changeDir, '.cross-service-snapshot');

    if (isArchived && (await this.exists(snapshotDir))) {
      // 归档：从快照读取
      return this.readFromSnapshot(snapshotDir, config.documents);
    } else {
      // 活跃：从实时路径读取
      const rootPath = path.resolve(changeDir, config.rootPath);

      // 安全检查
      if (!this.isPathSafe(this.cwd, rootPath)) {
        console.error('Path traversal detected, rejecting:', rootPath);
        return [];
      }

      return this.readFromLive(rootPath, config.documents);
    }
  }

  /**
   * 从实时路径读取文档
   */
  private async readFromLive(
    rootPath: string,
    documents: string[]
  ): Promise<CrossServiceDocument[]> {
    const results: CrossServiceDocument[] = [];

    for (const docName of documents) {
      const docPath = path.join(rootPath, docName);
      try {
        const content = await fs.readFile(docPath, 'utf-8');
        results.push({
          name: docName,
          path: docPath,
          content,
          isSnapshot: false,
        });
      } catch {
        // 文件不存在，跳过
      }
    }

    return results;
  }

  /**
   * 从快照读取文档
   */
  private async readFromSnapshot(
    snapshotDir: string,
    documents: string[]
  ): Promise<CrossServiceDocument[]> {
    const results: CrossServiceDocument[] = [];

    for (const docName of documents) {
      const docPath = path.join(snapshotDir, docName);
      try {
        const content = await fs.readFile(docPath, 'utf-8');
        results.push({
          name: docName,
          path: docPath,
          content,
          isSnapshot: true,
        });
      } catch {
        // 文件不存在，跳过
      }
    }

    return results;
  }

  /**
   * 读取单个跨服务文档
   */
  async readDocument(
    changeId: string,
    docName: string
  ): Promise<CrossServiceDocument | null> {
    const documents = await this.listDocuments(changeId);
    return documents.find((d) => d.name === docName) || null;
  }

  /**
   * 获取 change 的跨服务信息
   */
  async getCrossServiceInfo(changeId: string): Promise<CrossServiceInfo | null> {
    const changeDir = await this.getChangeDir(changeId);
    if (!changeDir) {
      return null;
    }

    const proposalPath = path.join(changeDir, 'proposal.md');
    const config = await this.parseConfig(proposalPath);
    if (!config) {
      return null;
    }

    const documents = await this.listDocuments(changeId);

    return {
      config,
      documents,
    };
  }

  /**
   * 创建跨服务文档快照（归档时使用）
   */
  async createSnapshot(changeDir: string, archiveDir: string): Promise<boolean> {
    const proposalPath = path.join(changeDir, 'proposal.md');
    const config = await this.parseConfig(proposalPath);

    if (!config || config.archivePolicy === 'reference') {
      return false;
    }

    const rootPath = path.resolve(changeDir, config.rootPath);

    // 安全检查
    if (!this.isPathSafe(this.cwd, rootPath)) {
      console.error('Path traversal detected, rejecting snapshot:', rootPath);
      return false;
    }

    const snapshotDir = path.join(archiveDir, '.cross-service-snapshot');

    try {
      await fs.mkdir(snapshotDir, { recursive: true });

      for (const docName of config.documents) {
        const srcPath = path.join(rootPath, docName);
        const destPath = path.join(snapshotDir, docName);

        try {
          // 确保目标目录存在（处理嵌套路径如 ddl/xxx.sql）
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(srcPath, destPath);
        } catch {
          // 源文件不存在，跳过
          console.warn(`Failed to copy cross-service doc: ${docName}`);
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to create cross-service snapshot:', error);
      return false;
    }
  }
}

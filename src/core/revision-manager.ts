/**
 * Revision Manager
 * 管理设计变更记录
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * 变更记录
 */
export interface Revision {
  id: string;
  description: string;
  reason?: string;
  author: string;
  createdAt: string;
}

/**
 * 变更记录文件结构
 */
interface RevisionsFile {
  changeId: string;
  revisions: Revision[];
}

export class RevisionManager {
  private cwd: string;

  constructor(options: { cwd: string }) {
    this.cwd = options.cwd;
  }

  /**
   * 获取变更目录
   */
  private getChangeDir(changeId: string): string {
    return path.join(this.cwd, 'openspec', 'changes', changeId);
  }

  /**
   * 获取 revisions.json 路径
   */
  private getRevisionsPath(changeId: string): string {
    return path.join(this.getChangeDir(changeId), 'revisions.json');
  }

  /**
   * 加载 revisions
   */
  private async loadRevisions(changeId: string): Promise<RevisionsFile> {
    const filePath = this.getRevisionsPath(changeId);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { changeId, revisions: [] };
    }
  }

  /**
   * 保存 revisions
   */
  private async saveRevisions(data: RevisionsFile): Promise<void> {
    const filePath = this.getRevisionsPath(data.changeId);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 记录设计变更
   */
  async recordRevision(
    changeId: string,
    description: string,
    options?: { reason?: string; author?: string }
  ): Promise<Revision> {
    const data = await this.loadRevisions(changeId);
    
    const revision: Revision = {
      id: `rev-${randomUUID().substring(0, 8)}`,
      description,
      reason: options?.reason,
      author: options?.author || 'AI',
      createdAt: new Date().toISOString(),
    };
    
    data.revisions.push(revision);
    await this.saveRevisions(data);
    
    return revision;
  }

  /**
   * 列出变更记录
   */
  async listRevisions(changeId: string): Promise<Revision[]> {
    const data = await this.loadRevisions(changeId);
    return data.revisions;
  }

  /**
   * 同步到 design.md 或 proposal.md
   */
  async syncToDocument(changeId: string): Promise<{ success: boolean; targetFile: string; count: number }> {
    const data = await this.loadRevisions(changeId);
    
    if (data.revisions.length === 0) {
      return { success: true, targetFile: '', count: 0 };
    }

    const changeDir = this.getChangeDir(changeId);
    const designPath = path.join(changeDir, 'design.md');
    const proposalPath = path.join(changeDir, 'proposal.md');
    
    // 确定目标文件
    let targetPath = designPath;
    let targetFile = 'design.md';
    try {
      await fs.access(designPath);
    } catch {
      targetPath = proposalPath;
      targetFile = 'proposal.md';
    }

    // 读取现有内容
    let content = '';
    try {
      content = await fs.readFile(targetPath, 'utf-8');
    } catch {
      return { success: false, targetFile, count: 0 };
    }

    // 检查是否已有 Revisions 章节
    if (content.includes('## Revisions')) {
      // 已存在，不重复添加
      return { success: true, targetFile, count: data.revisions.length };
    }

    // 生成 Revisions 章节
    let revisionsSection = '\n\n---\n\n## Revisions\n\n';
    revisionsSection += '| 日期 | 变更描述 | 原因 |\n';
    revisionsSection += '|------|----------|------|\n';
    
    for (const rev of data.revisions) {
      const date = rev.createdAt.slice(0, 10);
      const reason = rev.reason || '-';
      revisionsSection += `| ${date} | ${rev.description} | ${reason} |\n`;
    }

    // 追加到文件
    await fs.writeFile(targetPath, content + revisionsSection, 'utf-8');
    
    return { success: true, targetFile, count: data.revisions.length };
  }

  /**
   * 删除 revisions.json（归档后清理）
   */
  async deleteRevisionsFile(changeId: string): Promise<void> {
    const filePath = this.getRevisionsPath(changeId);
    try {
      await fs.unlink(filePath);
    } catch {
      // 文件不存在，忽略
    }
  }

  /**
   * 检查是否有未同步的 revisions
   */
  async hasRevisions(changeId: string): Promise<boolean> {
    const data = await this.loadRevisions(changeId);
    return data.revisions.length > 0;
  }
}

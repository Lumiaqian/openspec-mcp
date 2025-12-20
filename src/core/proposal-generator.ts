/**
 * Proposal 生成器
 * 辅助生成 proposal.md 和 tasks.md
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface ProposalDraft {
  proposal: string;
  tasks: string;
  summary: string;
}

export class ProposalGenerator {
  private cwd: string;

  constructor(options?: { cwd?: string }) {
    this.cwd = options?.cwd || process.cwd();
  }

  /**
   * 获取 openspec 目录
   */
  private getOpenSpecDir(): string {
    return path.join(this.cwd, 'openspec');
  }

  /**
   * 收集项目上下文
   */
  async gatherContext(): Promise<string> {
    const parts: string[] = [];

    // 读取 project.md
    try {
      const projectPath = path.join(this.getOpenSpecDir(), 'project.md');
      const content = await fs.readFile(projectPath, 'utf-8');
      parts.push('## Project Context\n\n' + content);
    } catch {
      // project.md 不存在
    }

    // 读取现有 specs 列表
    try {
      const specsDir = path.join(this.getOpenSpecDir(), 'specs');
      const entries = await fs.readdir(specsDir, { withFileTypes: true });
      const specs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      if (specs.length > 0) {
        parts.push('## Existing Specs\n\n' + specs.map((s) => `- ${s}`).join('\n'));
      }
    } catch {
      // specs 目录不存在
    }

    // 读取活跃的 changes
    try {
      const changesDir = path.join(this.getOpenSpecDir(), 'changes');
      const entries = await fs.readdir(changesDir, { withFileTypes: true });
      const changes = entries
        .filter((e) => e.isDirectory() && e.name !== 'archive')
        .map((e) => e.name);

      if (changes.length > 0) {
        parts.push('## Active Changes\n\n' + changes.map((c) => `- ${c}`).join('\n'));
      }
    } catch {
      // changes 目录不存在
    }

    return parts.join('\n\n');
  }

  /**
   * 构建生成 prompt
   */
  buildPrompt(requirement: string, context: string): string {
    return `You are helping to create an OpenSpec change proposal.

# Context

${context}

# Requirement

${requirement}

# Instructions

Generate a proposal.md and tasks.md for this requirement.

## proposal.md format:

\`\`\`markdown
# [Title]

## Summary
Brief description of the change.

## Motivation
Why is this change needed?

## Proposed Solution
High-level description of the solution.

## Impact
- Breaking changes (if any)
- Dependencies affected
\`\`\`

## tasks.md format:

\`\`\`markdown
# Tasks for [Title]

## 1. [Phase Name]

- [ ] **1.1** [Task description]
- [ ] **1.2** [Task description]

## 2. [Phase Name]

- [ ] **2.1** [Task description]
\`\`\`

Please generate both files based on the requirement. Be specific and actionable.`;
  }

  /**
   * 生成草稿（返回内容，需要 AI 处理）
   * 
   * 注意：这个方法只提供 prompt，实际生成需要由 AI 完成
   */
  async prepareGeneration(requirement: string): Promise<{
    prompt: string;
    context: string;
    suggestedId: string;
  }> {
    const context = await this.gatherContext();
    const prompt = this.buildPrompt(requirement, context);

    // 生成建议的 change ID
    const suggestedId = requirement
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join('-');

    return { prompt, context, suggestedId };
  }

  /**
   * 保存草稿到 change 目录
   */
  async saveDraft(
    changeId: string,
    proposal: string,
    tasks: string
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const changeDir = path.join(this.getOpenSpecDir(), 'changes', changeId);

    try {
      await fs.access(changeDir);
      return { success: false, error: `Change already exists: ${changeId}` };
    } catch {
      // 目录不存在，可以创建
    }

    try {
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'proposal.md'), proposal, 'utf-8');
      await fs.writeFile(path.join(changeDir, 'tasks.md'), tasks, 'utf-8');
      return { success: true, path: changeDir };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

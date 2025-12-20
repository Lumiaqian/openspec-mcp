/**
 * 模板管理器
 * 管理 Change 模板的创建和使用
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface TemplateFiles {
  proposal: string;
  tasks: string;
  design?: string;
}

export interface TemplateInfo {
  name: string;
  description: string;
  files: string[];
}

/**
 * 默认模板定义
 */
const DEFAULT_TEMPLATES: Record<string, { description: string; files: TemplateFiles }> = {
  feature: {
    description: 'New feature implementation',
    files: {
      proposal: `# Feature: {title}

## Summary

Brief description of the feature.

## Motivation

Why is this feature needed?

## Proposed Solution

High-level description of the solution.

## Alternatives Considered

Other approaches that were considered.

## Impact

- [ ] Breaking changes
- [ ] Database migrations
- [ ] API changes
`,
      tasks: `# Tasks for {title}

## 1. Planning

- [ ] **1.1** Review requirements
- [ ] **1.2** Design API/interface

## 2. Implementation

- [ ] **2.1** Implement core logic
- [ ] **2.2** Add error handling
- [ ] **2.3** Write unit tests

## 3. Integration

- [ ] **3.1** Integration testing
- [ ] **3.2** Documentation
- [ ] **3.3** Code review
`,
    },
  },
  bugfix: {
    description: 'Bug fix',
    files: {
      proposal: `# Bugfix: {title}

## Bug Description

What is the bug?

## Steps to Reproduce

1. Step 1
2. Step 2
3. Observe error

## Expected Behavior

What should happen?

## Root Cause

Analysis of why the bug occurs.

## Proposed Fix

How will the bug be fixed?
`,
      tasks: `# Tasks for {title}

## 1. Investigation

- [ ] **1.1** Reproduce the bug
- [ ] **1.2** Identify root cause

## 2. Fix

- [ ] **2.1** Implement fix
- [ ] **2.2** Add regression test

## 3. Verification

- [ ] **3.1** Verify fix works
- [ ] **3.2** Check for side effects
- [ ] **3.3** Code review
`,
    },
  },
  refactor: {
    description: 'Code refactoring',
    files: {
      proposal: `# Refactor: {title}

## Current State

Description of the current implementation.

## Problems

What issues does the current implementation have?

## Proposed Changes

How will the code be refactored?

## Benefits

- Improved maintainability
- Better performance
- Cleaner code

## Risks

Potential risks and mitigation strategies.
`,
      tasks: `# Tasks for {title}

## 1. Preparation

- [ ] **1.1** Ensure test coverage
- [ ] **1.2** Document current behavior

## 2. Refactoring

- [ ] **2.1** Extract/rename components
- [ ] **2.2** Simplify logic
- [ ] **2.3** Update tests

## 3. Validation

- [ ] **3.1** Run all tests
- [ ] **3.2** Performance check
- [ ] **3.3** Code review
`,
    },
  },
};

export class TemplateManager {
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
   * 获取模板目录
   */
  private getTemplatesDir(): string {
    return path.join(this.getOpenSpecDir(), 'templates');
  }

  /**
   * 列出所有可用模板
   */
  async listTemplates(): Promise<TemplateInfo[]> {
    const templates: TemplateInfo[] = [];

    // 添加内置模板
    for (const [name, template] of Object.entries(DEFAULT_TEMPLATES)) {
      templates.push({
        name,
        description: template.description,
        files: Object.keys(template.files),
      });
    }

    // 检查自定义模板
    try {
      const templatesDir = this.getTemplatesDir();
      const entries = await fs.readdir(templatesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !DEFAULT_TEMPLATES[entry.name]) {
          const files = await fs.readdir(path.join(templatesDir, entry.name));
          templates.push({
            name: entry.name,
            description: 'Custom template',
            files: files.filter((f) => f.endsWith('.md')),
          });
        }
      }
    } catch {
      // 模板目录不存在
    }

    return templates;
  }

  /**
   * 获取模板内容
   */
  async getTemplate(name: string): Promise<TemplateFiles | null> {
    // 先检查内置模板
    if (DEFAULT_TEMPLATES[name]) {
      return DEFAULT_TEMPLATES[name].files;
    }

    // 检查自定义模板
    const templateDir = path.join(this.getTemplatesDir(), name);
    try {
      const proposal = await fs.readFile(path.join(templateDir, 'proposal.md'), 'utf-8');
      const tasks = await fs.readFile(path.join(templateDir, 'tasks.md'), 'utf-8');
      let design: string | undefined;
      try {
        design = await fs.readFile(path.join(templateDir, 'design.md'), 'utf-8');
      } catch {
        // design.md 是可选的
      }
      return { proposal, tasks, design };
    } catch {
      return null;
    }
  }

  /**
   * 创建新的 Change
   */
  async createChange(
    changeId: string,
    options?: { template?: string; title?: string }
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const templateName = options?.template || 'feature';
    const title = options?.title || changeId;

    // 获取模板
    const template = await this.getTemplate(templateName);
    if (!template) {
      return { success: false, error: `Template not found: ${templateName}` };
    }

    // 创建 change 目录
    const changeDir = path.join(this.getOpenSpecDir(), 'changes', changeId);
    try {
      await fs.access(changeDir);
      return { success: false, error: `Change already exists: ${changeId}` };
    } catch {
      // 目录不存在，可以创建
    }

    try {
      await fs.mkdir(changeDir, { recursive: true });

      // 替换模板中的占位符
      const replacePlaceholders = (content: string) =>
        content.replace(/\{title\}/g, title).replace(/\{changeId\}/g, changeId);

      // 写入文件
      await fs.writeFile(
        path.join(changeDir, 'proposal.md'),
        replacePlaceholders(template.proposal),
        'utf-8'
      );
      await fs.writeFile(
        path.join(changeDir, 'tasks.md'),
        replacePlaceholders(template.tasks),
        'utf-8'
      );

      if (template.design) {
        await fs.writeFile(
          path.join(changeDir, 'design.md'),
          replacePlaceholders(template.design),
          'utf-8'
        );
      }

      return { success: true, path: changeDir };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

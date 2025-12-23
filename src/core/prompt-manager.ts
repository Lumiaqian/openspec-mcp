/**
 * Prompt Manager
 * 管理和生成 MCP Prompts
 */

import { ContextAnalyzer } from './context-analyzer.js';
import { OpenSpecCli } from './openspec-cli.js';
import { QARunner } from './qa-runner.js';
import path from 'path';
import fs from 'fs/promises';

export interface PromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text' | 'image' | 'resource';
    text?: string;
    resource?: {
      uri: string;
      mimeType?: string;
      text?: string;
    };
  };
}

export class PromptManager {
  private analyzer: ContextAnalyzer;
  private cli: OpenSpecCli;
  private qaRunner: QARunner;

  constructor(options: { cwd: string }) {
    this.analyzer = new ContextAnalyzer({ cwd: options.cwd });
    this.cli = new OpenSpecCli({ cwd: options.cwd });
    this.qaRunner = new QARunner({ cwd: options.cwd });
  }

  /**
   * 获取所有可用的 Prompts 定义
   */
  getPrompts(): PromptDefinition[] {
    return [
      {
        name: 'analyze-project',
        description: '深度分析当前项目架构、技术栈和改进建议',
        arguments: [
          {
            name: 'focus',
            description: '分析重点: overview(默认), architecture, improvements, conventions',
            required: false,
          },
        ],
      },
      {
        name: 'review-change',
        description: '审查指定的变更 (Change)，包含 Proposal, Specs 和 Tasks',
        arguments: [
          {
            name: 'changeId',
            description: 'Change ID (例如: feat-login)',
            required: true,
          },
        ],
      },
    ];
  }

  /**
   * 生成 Prompt 内容
   */
  async getPrompt(name: string, args: Record<string, string> = {}): Promise<PromptMessage[]> {
    switch (name) {
      case 'analyze-project':
        return this.generateAnalyzeProjectPrompt(args.focus || 'overview');
      case 'review-change':
        if (!args.changeId) {
          throw new Error('Missing required argument: changeId');
        }
        return this.generateReviewChangePrompt(args.changeId);
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  /**
   * 生成 analyze-project prompt
   */
  private async generateAnalyzeProjectPrompt(focus: string): Promise<PromptMessage[]> {
    // 1. 获取静态分析结果
    const context = await this.analyzer.analyze();
    const projectMd = await this.analyzer.getProjectMd();
    const keyFiles = await this.analyzer.getKeyFiles();

    // 2. 构建上下文描述
    let contextDescription = `
# Project Context

## Tech Stack
- Languages: ${context.stack.languages.map(l => `${l.name} (${l.percentage}%)`).join(', ')}
- Frameworks: ${context.stack.frameworks.join(', ')}
- Package Manager: ${context.stack.packageManager}
- Build Tools: ${context.stack.buildTools.join(', ')}

## Directory Structure
${context.structure.mainDirectories.map(d => `- ${d.name}/: ${d.purpose} (${d.fileCount} files)`).join('\n')}

## Patterns
- Architecture: ${context.patterns.architecture}
- Conventions: ${context.patterns.conventions.join(', ')}
`;

    if (projectMd) {
      contextDescription += `\n## Current project.md\n\n${projectMd}\n`;
    }

    // 3. 构建用户指令
    let instruction = '';
    switch (focus) {
      case 'architecture':
        instruction = '请分析项目的整体架构风格、模块划分和依赖关系。指出潜在的架构风险和改进点。';
        break;
      case 'improvements':
        instruction = '请根据当前的技术栈和代码结构，提出具体的代码质量、性能或可维护性方面的改进建议。';
        break;
      case 'conventions':
        instruction = '请分析项目的目录结构和文件命名，总结当前的开发约定，并建议是否需要制定更严格的规范。';
        break;
      case 'overview':
      default:
        instruction = '请作为一名资深技术专家，对该项目进行全面的技术评审。请总结项目的核心功能、技术亮点，并给出后续开发的建议。如果项目缺少 `project.md`，请帮我生成一个。';
        break;
    }

    // 4. 组装消息
    const messages: PromptMessage[] = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `${contextDescription}\n\nKey Files Content:\n${Object.entries(keyFiles).map(([path, content]) => `--- ${path} ---\n${content}\n`).join('\n')}\n\nTask: ${instruction}`,
        },
      },
    ];

    return messages;
  }

  /**
   * 生成 review-change prompt
   */
  private async generateReviewChangePrompt(changeId: string): Promise<PromptMessage[]> {
    // 1. 获取 Change 详情
    const change = await this.cli.showChange(changeId);
    if (!change) {
      throw new Error(`Change not found: ${changeId}`);
    }

    // 2. 获取 Specs
    const specsDir = path.join(this.cli['getOpenSpecDir'](), 'changes', changeId, 'specs');
    let specsContent = '';
    try {
      const entries = await fs.readdir(specsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const content = await fs.readFile(path.join(specsDir, entry.name), 'utf-8');
          specsContent += `\n--- Spec: ${entry.name} ---\n${content}\n`;
        }
      }
    } catch {
      specsContent = 'No specs found.';
    }

    // 3. 获取 QA 状态
    const qaResult = await this.qaRunner.getLatestQAResult(changeId);
    const qaSummary = qaResult 
      ? `QA Status: ${qaResult.summary.passed} passed, ${qaResult.summary.failed} failed. Last run: ${qaResult.startedAt}`
      : 'QA Status: Never run.';

    // 4. 构建上下文
    const contextDescription = `
# Change Review: ${changeId}

## Metadata
- Type: ${(change as any).type || 'unknown'}
- Status: ${change.status}
- Created: ${change.createdAt}

## Proposal
${change.proposal}

${change.design ? `## Design\n${change.design}` : ''}

## Tasks
${change.tasks}

## Specs
${specsContent}

## Quality Assurance
${qaSummary}
`;

    // 5. 组装消息
    const messages: PromptMessage[] = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `${contextDescription}\n\nTask: 请审查这个变更 (Change)。\n1. 检查 Proposal 和 Specs 之间的一致性。\n2. 评估 Design 是否满足需求。\n3.基于 Tasks 列表，评估实施计划的完整性。\n4. 如果有 QA 失败，请给出修复建议。`,
        },
      },
    ];

    return messages;
  }
}

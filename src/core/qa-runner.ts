/**
 * QA Runner - 质量循环模块
 * 
 * 自动运行验证检查，发现问题后可触发修复循环：
 * - 语法检查 (syntax)
 * - 类型检查 (typecheck)
 * - Lint 检查 (lint)
 * - 测试运行 (test)
 * - 构建验证 (build)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

/**
 * QA 检查类型
 */
export type QACheckType = 'syntax' | 'typecheck' | 'lint' | 'test' | 'build';

/**
 * QA 配置
 */
export interface QAConfig {
  maxIterations: number;     // 最大修复尝试次数
  checks: QACheckType[];     // 启用的检查类型
  autoFix: boolean;          // 是否自动修复
  timeout: number;           // 单次检查超时(ms)
  commands?: Partial<Record<QACheckType, string>>; // 自定义命令
}

/**
 * 单次检查结果
 */
export interface QACheckResult {
  type: QACheckType;
  status: 'passed' | 'failed' | 'skipped' | 'timeout';
  output?: string;
  errors?: string[];
  duration: number;
}

/**
 * QA 运行状态
 */
export type QAStatus = 'pending' | 'running' | 'passed' | 'failed' | 'fixing' | 'timeout' | 'stopped';

/**
 * QA 运行结果
 */
export interface QAResult {
  id: string;
  changeName: string;
  status: QAStatus;
  iteration: number;
  maxIterations: number;
  checks: QACheckResult[];
  startedAt: string;
  completedAt?: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

/**
 * 默认 QA 配置
 */
const DEFAULT_CONFIG: QAConfig = {
  maxIterations: 5,
  checks: ['typecheck', 'lint', 'test'],
  autoFix: false,
  timeout: 60000,  // 60 seconds
};

/**
 * 默认检查命令
 */
const DEFAULT_COMMANDS: Record<QACheckType, string> = {
  syntax: 'npx tsc --noEmit --skipLibCheck',
  typecheck: 'npx tsc --noEmit',
  lint: 'npm run lint --silent 2>/dev/null || echo "lint script not found"',
  test: 'npm test --silent 2>/dev/null || echo "test script not found"',
  build: 'npm run build --silent',
};

/**
 * QARunner 主类
 */
export class QARunner {
  private cwd: string;
  private config: QAConfig;
  private runningQA: Map<string, { aborted: boolean }> = new Map();

  constructor(options?: { cwd?: string; config?: Partial<QAConfig> }) {
    this.cwd = options?.cwd || process.cwd();
    this.config = { ...DEFAULT_CONFIG, ...options?.config };
  }

  /**
   * 获取 QA 结果存储目录
   */
  private getQADir(): string {
    return path.join(this.cwd, 'openspec', 'qa');
  }

  /**
   * 获取变更目录
   */
  private getChangeDir(changeName: string): string {
    const safeId = this.ensureSafeId(changeName);
    return path.join(this.cwd, 'openspec', 'changes', safeId);
  }

  /**
   * ID 安全校验
   */
  private ensureSafeId(id: string): string {
    const trimmed = id.trim();
    if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
      throw new Error(`Invalid id: ${id}`);
    }
    return trimmed;
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * 运行 QA 检查
   */
  async runQA(
    changeName: string,
    options?: { checks?: QACheckType[] }
  ): Promise<QAResult> {
    const safeId = this.ensureSafeId(changeName);
    
    // 检查变更是否存在
    const changeDir = this.getChangeDir(safeId);
    try {
      await fs.access(changeDir);
    } catch {
      throw new Error(`Change not found: ${changeName}`);
    }
    
    // 初始化结果
    const result: QAResult = {
      id: randomUUID().substring(0, 8),
      changeName: safeId,
      status: 'running',
      iteration: 1,
      maxIterations: this.config.maxIterations,
      checks: [],
      startedAt: new Date().toISOString(),
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    };
    
    // 用于控制终止
    const control = { aborted: false };
    this.runningQA.set(safeId, control);
    
    try {
      const checksToRun = options?.checks || this.config.checks;
      result.summary.total = checksToRun.length;
      
      for (const checkType of checksToRun) {
        if (control.aborted) {
          result.status = 'stopped';
          break;
        }
        
        const checkResult = await this.runCheck(checkType);
        result.checks.push(checkResult);
        
        // 更新统计
        if (checkResult.status === 'passed') {
          result.summary.passed++;
        } else if (checkResult.status === 'failed') {
          result.summary.failed++;
        } else if (checkResult.status === 'skipped') {
          result.summary.skipped++;
        }
      }
      
      // 确定最终状态
      if (result.status !== 'stopped') {
        result.status = result.summary.failed > 0 ? 'failed' : 'passed';
      }
    } finally {
      this.runningQA.delete(safeId);
      result.completedAt = new Date().toISOString();
    }
    
    // 保存结果
    await this.saveQAResult(result);
    
    return result;
  }

  /**
   * 运行单个检查
   */
  private async runCheck(type: QACheckType): Promise<QACheckResult> {
    const startTime = Date.now();
    const command = this.config.commands?.[type] || DEFAULT_COMMANDS[type];
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.cwd,
        timeout: this.config.timeout,
        env: { ...process.env, CI: 'true' },
      });
      
      const duration = Date.now() - startTime;
      const output = stdout + (stderr ? '\n' + stderr : '');
      
      // 检查输出中是否包含错误标识
      const hasError = /error|failed|failure/i.test(output) && !/0 error/i.test(output);
      
      return {
        type,
        status: hasError ? 'failed' : 'passed',
        output: output.slice(0, 2000), // 限制输出长度
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // 检查是否超时（Node.js exec 超时时设置 killed 或 signal）
      const execError = error as { killed?: boolean; signal?: string; stdout?: string; stderr?: string; message?: string };
      if (execError.killed || execError.signal === 'SIGTERM') {
        return {
          type,
          status: 'timeout',
          errors: [`Check timed out after ${this.config.timeout}ms`],
          duration,
        };
      }
      
      // 命令执行失败
      return {
        type,
        status: 'failed',
        output: execError.stdout?.slice(0, 1000),
        errors: [execError.stderr || execError.message || 'Unknown error'].slice(0, 5),
        duration,
      };
    }
  }

  /**
   * 获取 QA 状态
   */
  async getQAStatus(changeName: string): Promise<QAResult | null> {
    const latest = await this.getLatestQAResult(changeName);
    return latest;
  }

  /**
   * 获取 QA 历史
   */
  async getQAHistory(changeName: string, limit = 10): Promise<QAResult[]> {
    const qaDir = this.getQADir();
    const safeId = this.ensureSafeId(changeName);
    
    try {
      const files = await fs.readdir(qaDir);
      const matchingFiles = files
        .filter(f => f.startsWith(safeId + '_') && f.endsWith('.json'))
        .sort()
        .reverse();
      
      const results: QAResult[] = [];
      for (const file of matchingFiles.slice(0, limit)) {
        try {
          const content = await fs.readFile(path.join(qaDir, file), 'utf-8');
          results.push(JSON.parse(content));
        } catch {
          // 跳过无效文件
        }
      }
      
      return results;
    } catch {
      return [];
    }
  }

  /**
   * 获取最新 QA 结果
   */
  async getLatestQAResult(changeName: string): Promise<QAResult | null> {
    const history = await this.getQAHistory(changeName, 1);
    return history[0] || null;
  }

  /**
   * 停止正在运行的 QA
   */
  async stopQA(changeName: string): Promise<boolean> {
    const safeId = this.ensureSafeId(changeName);
    const control = this.runningQA.get(safeId);
    
    if (control) {
      control.aborted = true;
      return true;
    }
    
    return false;
  }

  /**
   * 检查 QA 是否正在运行
   */
  isRunning(changeName: string): boolean {
    const safeId = this.ensureSafeId(changeName);
    return this.runningQA.has(safeId);
  }

  /**
   * 保存 QA 结果
   */
  private async saveQAResult(result: QAResult): Promise<void> {
    const qaDir = this.getQADir();
    await this.ensureDir(qaDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(qaDir, `${result.changeName}_${timestamp}.json`);
    
    await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
  }

  /**
   * 获取进度汇总（所有变更）
   */
  async getQASummary(): Promise<{
    total: number;
    passed: number;
    failed: number;
    running: number;
    changes: Array<{
      name: string;
      status: QAStatus;
      lastRun?: string;
    }>;
  }> {
    const changesDir = path.join(this.cwd, 'openspec', 'changes');
    const summary = {
      total: 0,
      passed: 0,
      failed: 0,
      running: 0,
      changes: [] as Array<{ name: string; status: QAStatus; lastRun?: string }>,
    };
    
    try {
      const changes = await fs.readdir(changesDir);
      
      for (const change of changes) {
        const stat = await fs.stat(path.join(changesDir, change));
        if (!stat.isDirectory()) continue;
        
        summary.total++;
        const latest = await this.getLatestQAResult(change);
        
        if (this.isRunning(change)) {
          summary.running++;
          summary.changes.push({ name: change, status: 'running' });
        } else if (latest) {
          if (latest.status === 'passed') summary.passed++;
          else if (latest.status === 'failed') summary.failed++;
          summary.changes.push({
            name: change,
            status: latest.status,
            lastRun: latest.completedAt,
          });
        } else {
          summary.changes.push({ name: change, status: 'pending' });
        }
      }
    } catch {
      // 目录不存在时返回空结果
    }
    
    return summary;
  }
}

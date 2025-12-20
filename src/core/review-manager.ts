/**
 * Review Manager
 * 管理评审意见（Review Comments）
 * 
 * 替代原有的 AnnotationManager，提供更完善的评审功能：
 * - 支持多种目标类型 (proposal/design/spec/tasks)
 * - 基于行号定位
 * - 评论类型和优先级
 * - 回复功能
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * 评审目标类型
 */
export type ReviewTargetType = 'proposal' | 'design' | 'spec' | 'tasks';

/**
 * 评审类型
 */
export type ReviewType = 'comment' | 'suggestion' | 'question' | 'issue';

/**
 * 严重性等级
 */
export type ReviewSeverity = 'low' | 'medium' | 'high';

/**
 * 评审状态
 */
export type ReviewStatus = 'open' | 'resolved' | 'wont_fix';

/**
 * 评审回复
 */
export interface ReviewReply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

/**
 * 评审意见
 */
export interface ReviewComment {
  id: string;
  
  // 目标定位
  targetType: ReviewTargetType;
  targetId: string;           // change-id 或 spec-id
  lineNumber?: number;        // 行号定位（可选）
  
  // 评论内容
  type: ReviewType;
  severity?: ReviewSeverity;
  body: string;
  suggestedChange?: string;   // 建议的修改（用于 suggestion 类型）
  
  // 元数据
  author: string;
  status: ReviewStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  
  // 回复
  replies: ReviewReply[];
}

/**
 * 评审统计
 */
export interface ReviewSummary {
  total: number;
  open: number;
  resolved: number;
  wontFix: number;
  byType: Record<ReviewType, number>;
  bySeverity: Record<ReviewSeverity, number>;
  hasBlockingIssues: boolean;
}

export class ReviewManager {
  private cwd: string;

  constructor(options?: { cwd?: string }) {
    this.cwd = options?.cwd || process.cwd();
  }

  /**
   * 获取评审存储目录
   */
  private getReviewsDir(): string {
    return path.join(this.cwd, 'openspec', 'reviews');
  }

  /**
   * 获取评审文件路径
   */
  private getReviewFilePath(targetType: ReviewTargetType, targetId: string): string {
    const safeId = this.ensureSafeId(targetId);
    
    // spec -> reviews/specs/{specId}.json
    // proposal/design/tasks -> reviews/changes/{changeId}/{targetType}.json
    if (targetType === 'spec') {
      return path.join(this.getReviewsDir(), 'specs', `${safeId}.json`);
    }
    
    // For change-related reviews, store in separate files per type
    return path.join(this.getReviewsDir(), 'changes', safeId, `${targetType}.json`);
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
  private async ensureDir(filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  }

  /**
   * 加载评审列表
   */
  async loadReviews(targetType: ReviewTargetType, targetId: string): Promise<ReviewComment[]> {
    const filePath = this.getReviewFilePath(targetType, targetId);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as ReviewComment[];
    } catch {
      return [];
    }
  }

  /**
   * 保存评审列表
   */
  private async saveReviews(
    targetType: ReviewTargetType,
    targetId: string,
    reviews: ReviewComment[]
  ): Promise<void> {
    const filePath = this.getReviewFilePath(targetType, targetId);
    await this.ensureDir(filePath);
    await fs.writeFile(filePath, JSON.stringify(reviews, null, 2), 'utf-8');
  }

  /**
   * 添加评审意见
   */
  async addReview(options: {
    targetType: ReviewTargetType;
    targetId: string;
    lineNumber?: number;
    type: ReviewType;
    severity?: ReviewSeverity;
    body: string;
    suggestedChange?: string;
    author: string;
  }): Promise<ReviewComment> {
    const reviews = await this.loadReviews(options.targetType, options.targetId);
    
    const review: ReviewComment = {
      id: randomUUID().substring(0, 8),
      targetType: options.targetType,
      targetId: options.targetId,
      lineNumber: options.lineNumber,
      type: options.type,
      severity: options.severity,
      body: options.body,
      suggestedChange: options.suggestedChange,
      author: options.author,
      status: 'open',
      createdAt: new Date().toISOString(),
      replies: [],
    };

    reviews.push(review);
    await this.saveReviews(options.targetType, options.targetId, reviews);
    
    return review;
  }

  /**
   * 列出评审意见
   */
  async listReviews(
    targetType: ReviewTargetType,
    targetId: string,
    options?: { status?: ReviewStatus; type?: ReviewType }
  ): Promise<ReviewComment[]> {
    let reviews = await this.loadReviews(targetType, targetId);
    
    if (options?.status) {
      reviews = reviews.filter((r) => r.status === options.status);
    }
    if (options?.type) {
      reviews = reviews.filter((r) => r.type === options.type);
    }
    
    return reviews;
  }

  /**
   * 获取单个评审
   */
  async getReview(
    targetType: ReviewTargetType,
    targetId: string,
    reviewId: string
  ): Promise<ReviewComment | null> {
    const reviews = await this.loadReviews(targetType, targetId);
    return reviews.find((r) => r.id === reviewId) || null;
  }

  /**
   * 添加回复
   */
  async addReply(
    targetType: ReviewTargetType,
    targetId: string,
    reviewId: string,
    author: string,
    body: string
  ): Promise<ReviewReply | null> {
    const reviews = await this.loadReviews(targetType, targetId);
    const review = reviews.find((r) => r.id === reviewId);
    
    if (!review) {
      return null;
    }

    const reply: ReviewReply = {
      id: randomUUID().substring(0, 8),
      author,
      body,
      createdAt: new Date().toISOString(),
    };

    review.replies.push(reply);
    await this.saveReviews(targetType, targetId, reviews);
    
    return reply;
  }

  /**
   * 解决评审意见
   */
  async resolveReview(
    targetType: ReviewTargetType,
    targetId: string,
    reviewId: string,
    resolvedBy: string,
    status: 'resolved' | 'wont_fix' = 'resolved'
  ): Promise<boolean> {
    const reviews = await this.loadReviews(targetType, targetId);
    const review = reviews.find((r) => r.id === reviewId);
    
    if (!review) {
      return false;
    }

    review.status = status;
    review.resolvedAt = new Date().toISOString();
    review.resolvedBy = resolvedBy;
    
    await this.saveReviews(targetType, targetId, reviews);
    return true;
  }

  /**
   * 获取评审统计
   */
  async getReviewSummary(
    targetType: ReviewTargetType,
    targetId: string
  ): Promise<ReviewSummary> {
    const reviews = await this.loadReviews(targetType, targetId);
    
    const summary: ReviewSummary = {
      total: reviews.length,
      open: 0,
      resolved: 0,
      wontFix: 0,
      byType: { comment: 0, suggestion: 0, question: 0, issue: 0 },
      bySeverity: { low: 0, medium: 0, high: 0 },
      hasBlockingIssues: false,
    };

    for (const review of reviews) {
      // 状态统计
      if (review.status === 'open') summary.open++;
      else if (review.status === 'resolved') summary.resolved++;
      else if (review.status === 'wont_fix') summary.wontFix++;
      
      // 类型统计
      summary.byType[review.type]++;
      
      // 严重性统计
      if (review.severity) {
        summary.bySeverity[review.severity]++;
      }
      
      // 检查阻塞性问题
      if (review.status === 'open' && review.type === 'issue' && review.severity === 'high') {
        summary.hasBlockingIssues = true;
      }
    }

    return summary;
  }

  /**
   * 获取 Change 的所有评审（包括 proposal/design/tasks）
   */
  async getChangeReviews(changeId: string): Promise<{
    proposal: ReviewComment[];
    design: ReviewComment[];
    tasks: ReviewComment[];
    summary: ReviewSummary;
  }> {
    const proposal = await this.loadReviews('proposal', changeId);
    const design = await this.loadReviews('design', changeId);
    const tasks = await this.loadReviews('tasks', changeId);
    
    const allReviews = [...proposal, ...design, ...tasks];
    
    // 计算总体统计
    const summary: ReviewSummary = {
      total: allReviews.length,
      open: allReviews.filter((r) => r.status === 'open').length,
      resolved: allReviews.filter((r) => r.status === 'resolved').length,
      wontFix: allReviews.filter((r) => r.status === 'wont_fix').length,
      byType: { comment: 0, suggestion: 0, question: 0, issue: 0 },
      bySeverity: { low: 0, medium: 0, high: 0 },
      hasBlockingIssues: false,
    };

    for (const review of allReviews) {
      summary.byType[review.type]++;
      if (review.severity) summary.bySeverity[review.severity]++;
      if (review.status === 'open' && review.type === 'issue' && review.severity === 'high') {
        summary.hasBlockingIssues = true;
      }
    }

    return { proposal, design, tasks, summary };
  }

  /**
   * 检查是否可以请求审批
   * 返回阻塞原因列表，空数组表示可以审批
   */
  async checkApprovalReadiness(changeId: string): Promise<string[]> {
    const blockers: string[] = [];
    const { summary, proposal, design, tasks } = await this.getChangeReviews(changeId);

    // 检查高严重性 issue
    if (summary.hasBlockingIssues) {
      const highIssues = [...proposal, ...design, ...tasks].filter(
        (r) => r.status === 'open' && r.type === 'issue' && r.severity === 'high'
      );
      blockers.push(`${highIssues.length} high-severity issue(s) must be resolved`);
    }

    // 检查未回答的问题
    const openQuestions = [...proposal, ...design, ...tasks].filter(
      (r) => r.status === 'open' && r.type === 'question'
    );
    if (openQuestions.length > 0) {
      blockers.push(`${openQuestions.length} question(s) need to be answered`);
    }

    return blockers;
  }
}

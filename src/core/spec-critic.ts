/**
 * Spec Critic - 规格自审模块
 * 
 * 在人工审批前自动评审 proposal/design 文档，识别潜在问题：
 * - 完整性检查：问题描述、解决方案、影响范围
 * - 技术可行性：代码引用、依赖兼容性
 * - 安全考量：认证、授权、数据验证
 * - 边界条件：错误处理、空值、并发
 * - 清晰度：术语一致性、表述歧义
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * 评审类别
 */
export type CritiqueCategory = 
  | 'completeness'  // 完整性
  | 'feasibility'   // 技术可行性
  | 'security'      // 安全考量
  | 'edge_case'     // 边界条件
  | 'clarity';      // 清晰度

/**
 * 严重程度
 */
export type CritiqueSeverity = 'critical' | 'warning' | 'info';

/**
 * 单条评审意见
 */
export interface Critique {
  id: string;
  category: CritiqueCategory;
  severity: CritiqueSeverity;
  title: string;
  description: string;
  location?: {
    section: string;
    lineRange?: [number, number];
  };
  suggestion?: string;
}

/**
 * 评审结果
 */
export interface CritiqueResult {
  changeName: string;
  documentType: 'proposal' | 'design' | 'all';
  overallScore: number;  // 1-10
  critiques: Critique[];
  suggestions: string[];
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    byCategory: Record<CritiqueCategory, number>;
  };
  createdAt: string;
}

/**
 * 评审规则
 */
interface CritiqueRule {
  id: string;
  category: CritiqueCategory;
  severity: CritiqueSeverity;
  title: string;
  description: string;
  check: (content: string, sections: Map<string, string>) => CritiqueMatch | null;
}

interface CritiqueMatch {
  matched: boolean;
  details?: string;
  suggestion?: string;
  section?: string;
}

/**
 * SpecCritic 主类
 */
export class SpecCritic {
  private cwd: string;
  private rules: CritiqueRule[];

  constructor(options?: { cwd?: string }) {
    this.cwd = options?.cwd || process.cwd();
    this.rules = this.initializeRules();
  }

  /**
   * 获取评审结果存储目录
   */
  private getCritiquesDir(): string {
    return path.join(this.cwd, 'openspec', 'critiques');
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
   * 评审 Proposal
   */
  async critiqueProposal(changeName: string): Promise<CritiqueResult> {
    const changeDir = this.getChangeDir(changeName);
    const proposalPath = path.join(changeDir, 'proposal.md');
    
    try {
      const content = await fs.readFile(proposalPath, 'utf-8');
      return this.performCritique(changeName, 'proposal', content);
    } catch (error) {
      throw new Error(`Failed to read proposal for ${changeName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 评审 Design
   */
  async critiqueDesign(changeName: string): Promise<CritiqueResult> {
    const changeDir = this.getChangeDir(changeName);
    const designPath = path.join(changeDir, 'design.md');
    
    try {
      const content = await fs.readFile(designPath, 'utf-8');
      return this.performCritique(changeName, 'design', content);
    } catch (error) {
      throw new Error(`Failed to read design for ${changeName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 评审所有文档（proposal + design）
   */
  async critiqueAll(changeName: string): Promise<CritiqueResult> {
    const changeDir = this.getChangeDir(changeName);
    
    let combinedContent = '';
    
    // 读取 proposal
    try {
      const proposalPath = path.join(changeDir, 'proposal.md');
      const proposal = await fs.readFile(proposalPath, 'utf-8');
      combinedContent += '# PROPOSAL\n\n' + proposal + '\n\n';
    } catch {
      // proposal 可能不存在，跳过
    }
    
    // 读取 design
    try {
      const designPath = path.join(changeDir, 'design.md');
      const design = await fs.readFile(designPath, 'utf-8');
      combinedContent += '# DESIGN\n\n' + design;
    } catch {
      // design 可能不存在，跳过
    }
    
    if (!combinedContent.trim()) {
      throw new Error(`No proposal or design found for ${changeName}`);
    }
    
    return this.performCritique(changeName, 'all', combinedContent);
  }

  /**
   * 执行评审
   */
  private performCritique(
    changeName: string,
    documentType: 'proposal' | 'design' | 'all',
    content: string
  ): CritiqueResult {
    const sections = this.parseSections(content);
    const critiques: Critique[] = [];
    
    // 应用所有规则
    for (const rule of this.rules) {
      const match = rule.check(content, sections);
      if (match?.matched) {
        critiques.push({
          id: randomUUID().substring(0, 8),
          category: rule.category,
          severity: rule.severity,
          title: rule.title,
          description: match.details || rule.description,
          location: match.section ? { section: match.section } : undefined,
          suggestion: match.suggestion,
        });
      }
    }
    
    // 计算统计
    const summary = {
      total: critiques.length,
      critical: critiques.filter(c => c.severity === 'critical').length,
      warning: critiques.filter(c => c.severity === 'warning').length,
      info: critiques.filter(c => c.severity === 'info').length,
      byCategory: {
        completeness: critiques.filter(c => c.category === 'completeness').length,
        feasibility: critiques.filter(c => c.category === 'feasibility').length,
        security: critiques.filter(c => c.category === 'security').length,
        edge_case: critiques.filter(c => c.category === 'edge_case').length,
        clarity: critiques.filter(c => c.category === 'clarity').length,
      },
    };
    
    // 计算总分 (10 - penalties)
    const penalties = summary.critical * 2 + summary.warning * 1 + summary.info * 0.2;
    const overallScore = Math.max(1, Math.min(10, 10 - penalties));
    
    // 生成建议
    const suggestions = this.generateSuggestions(critiques);
    
    const result: CritiqueResult = {
      changeName,
      documentType,
      overallScore: Math.round(overallScore * 10) / 10,
      critiques,
      suggestions,
      summary,
      createdAt: new Date().toISOString(),
    };
    
    // 异步保存结果
    this.saveCritiqueResult(result).catch(() => {
      // 忽略保存错误
    });
    
    return result;
  }

  /**
   * 解析文档章节
   */
  private parseSections(content: string): Map<string, string> {
    const sections = new Map<string, string>();
    const lines = content.split('\n');
    
    let currentSection = 'preamble';
    let sectionContent: string[] = [];
    
    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headerMatch) {
        // 保存上一个章节
        if (sectionContent.length > 0) {
          sections.set(currentSection.toLowerCase(), sectionContent.join('\n'));
        }
        currentSection = headerMatch[2];
        sectionContent = [];
      } else {
        sectionContent.push(line);
      }
    }
    
    // 保存最后一个章节
    if (sectionContent.length > 0) {
      sections.set(currentSection.toLowerCase(), sectionContent.join('\n'));
    }
    
    return sections;
  }

  /**
   * 生成综合建议
   */
  private generateSuggestions(critiques: Critique[]): string[] {
    const suggestions: string[] = [];
    
    // 按类别生成建议
    const byCategory = new Map<CritiqueCategory, Critique[]>();
    for (const c of critiques) {
      if (!byCategory.has(c.category)) {
        byCategory.set(c.category, []);
      }
      byCategory.get(c.category)!.push(c);
    }
    
    if ((byCategory.get('completeness')?.length || 0) > 0) {
      suggestions.push('补充缺失的文档章节，确保问题描述、解决方案和影响范围完整');
    }
    
    if ((byCategory.get('security')?.length || 0) > 0) {
      suggestions.push('审查安全相关设计，确保认证、授权和数据验证机制到位');
    }
    
    if ((byCategory.get('edge_case')?.length || 0) > 0) {
      suggestions.push('增加边界条件和错误处理的说明');
    }
    
    if ((byCategory.get('clarity')?.length || 0) > 0) {
      suggestions.push('改进文档清晰度，统一术语使用');
    }
    
    return suggestions;
  }

  /**
   * 保存评审结果
   */
  async saveCritiqueResult(result: CritiqueResult): Promise<void> {
    const critiquesDir = this.getCritiquesDir();
    await this.ensureDir(critiquesDir);
    
    const filePath = path.join(
      critiquesDir,
      `${result.changeName}_${result.documentType}_${Date.now()}.json`
    );
    
    await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
  }

  /**
   * 获取评审历史
   */
  async getCritiqueHistory(changeName: string): Promise<CritiqueResult[]> {
    const critiquesDir = this.getCritiquesDir();
    const safeId = this.ensureSafeId(changeName);
    
    try {
      const files = await fs.readdir(critiquesDir);
      const matchingFiles = files.filter(f => f.startsWith(safeId + '_') && f.endsWith('.json'));
      
      const results: CritiqueResult[] = [];
      for (const file of matchingFiles) {
        try {
          const content = await fs.readFile(path.join(critiquesDir, file), 'utf-8');
          results.push(JSON.parse(content));
        } catch {
          // 跳过无效文件
        }
      }
      
      // 按时间排序
      return results.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * 获取最新评审结果
   */
  async getLatestCritique(changeName: string): Promise<CritiqueResult | null> {
    const history = await this.getCritiqueHistory(changeName);
    return history[0] || null;
  }

  /**
   * 初始化评审规则
   */
  private initializeRules(): CritiqueRule[] {
    return [
      // --- 完整性检查 ---
      {
        id: 'missing-problem',
        category: 'completeness',
        severity: 'critical',
        title: '缺少问题描述',
        description: '文档应包含清晰的问题描述章节',
        check: (content, sections) => {
          const hasProb = content.toLowerCase().includes('problem') ||
                          content.toLowerCase().includes('issue') ||
                          content.toLowerCase().includes('背景') ||
                          content.toLowerCase().includes('问题') ||
                          sections.has('problem') ||
                          sections.has('background');
          return { matched: !hasProb, suggestion: '添加 "Problem" 或 "背景" 章节描述要解决的问题' };
        },
      },
      {
        id: 'missing-solution',
        category: 'completeness',
        severity: 'critical',
        title: '缺少解决方案',
        description: '文档应包含解决方案描述',
        check: (content, sections) => {
          const hasSol = content.toLowerCase().includes('solution') ||
                         content.toLowerCase().includes('approach') ||
                         content.toLowerCase().includes('解决方案') ||
                         content.toLowerCase().includes('方案') ||
                         sections.has('solution') ||
                         sections.has('approach') ||
                         sections.has('design');
          return { matched: !hasSol, suggestion: '添加 "Solution" 或 "解决方案" 章节' };
        },
      },
      {
        id: 'missing-impact',
        category: 'completeness',
        severity: 'warning',
        title: '缺少影响范围',
        description: '文档应描述变更的影响范围',
        check: (content) => {
          const hasImpact = content.toLowerCase().includes('impact') ||
                           content.toLowerCase().includes('scope') ||
                           content.toLowerCase().includes('影响') ||
                           content.toLowerCase().includes('范围');
          return { matched: !hasImpact, suggestion: '添加 "Impact" 或 "影响范围" 说明' };
        },
      },
      
      // --- 技术可行性 ---
      {
        id: 'no-code-reference',
        category: 'feasibility',
        severity: 'info',
        title: '缺少代码引用',
        description: '设计文档应引用相关代码文件',
        check: (content) => {
          const hasCodeRef = /`[A-Za-z_][\w/.-]+\.(ts|js|go|py|java|tsx|jsx)`/.test(content) ||
                            content.includes('file://') ||
                            /\b(src|lib|pkg|internal)\//.test(content);
          return { matched: !hasCodeRef, suggestion: '添加相关代码文件的引用以便实现' };
        },
      },
      {
        id: 'todo-placeholder',
        category: 'feasibility',
        severity: 'warning',
        title: '存在 TODO 占位符',
        description: '文档中存在未完成的 TODO 标记',
        check: (content) => {
          const todoMatch = content.match(/\bTODO\b|\bFIXME\b|\bTBD\b|\bXXX\b/gi);
          if (todoMatch && todoMatch.length > 0) {
            return { 
              matched: true, 
              details: `发现 ${todoMatch.length} 处 TODO/TBD 标记`,
              suggestion: '完成所有 TODO 项后再提交审批' 
            };
          }
          return { matched: false };
        },
      },
      
      // --- 安全考量 ---
      {
        id: 'auth-not-mentioned',
        category: 'security',
        severity: 'warning',
        title: '未提及认证授权',
        description: 'API 或用户相关变更应说明认证授权策略',
        check: (content) => {
          const isApi = content.toLowerCase().includes('api') ||
                       content.toLowerCase().includes('endpoint') ||
                       content.toLowerCase().includes('接口');
          const hasAuth = content.toLowerCase().includes('auth') ||
                         content.toLowerCase().includes('permission') ||
                         content.toLowerCase().includes('认证') ||
                         content.toLowerCase().includes('授权') ||
                         content.toLowerCase().includes('权限');
          return { 
            matched: isApi && !hasAuth, 
            suggestion: '添加认证和授权相关说明' 
          };
        },
      },
      {
        id: 'sensitive-data',
        category: 'security',
        severity: 'critical',
        title: '涉及敏感数据',
        description: '涉及敏感数据的变更需要特别说明安全措施',
        check: (content, sections) => {
          // 如果已有安全章节，则认为已考虑(或至少不直接判为 critical)
          if (sections.has('security') || sections.has('safety') || sections.has('安全')) {
            return { matched: false };
          }

          const sensitivePatterns = [
            /password/i, /secret/i, /token/i, /密码/, /密钥/,
            /credit.?card/i, /信用卡/, /身份证/, /ssn/i,
            /private.?key/i, /私钥/
          ];
          for (const pattern of sensitivePatterns) {
            if (pattern.test(content)) {
              return { 
                matched: true, 
                details: '文档涉及敏感数据且未发现安全章节，请确保有适当的安全措施',
                suggestion: '添加 "Security" 或 "安全" 章节说明数据保护措施' 
              };
            }
          }
          return { matched: false };
        },
      },
      
      // --- 边界条件 ---
      {
        id: 'no-error-handling',
        category: 'edge_case',
        severity: 'warning',
        title: '未提及错误处理',
        description: '应说明异常和错误情况的处理方式',
        check: (content) => {
          const hasError = content.toLowerCase().includes('error') ||
                          content.toLowerCase().includes('exception') ||
                          content.toLowerCase().includes('failure') ||
                          content.toLowerCase().includes('错误') ||
                          content.toLowerCase().includes('异常') ||
                          content.toLowerCase().includes('失败');
          return { matched: !hasError, suggestion: '添加错误处理和异常情况的说明' };
        },
      },
      {
        id: 'no-concurrency',
        category: 'edge_case',
        severity: 'info',
        title: '未考虑并发场景',
        description: '涉及数据更新的变更应考虑并发情况',
        check: (content) => {
          const isDataChange = content.toLowerCase().includes('update') ||
                              content.toLowerCase().includes('write') ||
                              content.toLowerCase().includes('修改') ||
                              content.toLowerCase().includes('更新');
          const hasConcurrency = content.toLowerCase().includes('concurren') ||
                                content.toLowerCase().includes('race') ||
                                content.toLowerCase().includes('lock') ||
                                content.toLowerCase().includes('并发') ||
                                content.toLowerCase().includes('锁');
          return { 
            matched: isDataChange && !hasConcurrency, 
            suggestion: '考虑添加并发控制相关说明' 
          };
        },
      },
      
      // --- 清晰度 ---
      {
        id: 'too-short',
        category: 'clarity',
        severity: 'warning',
        title: '文档过短',
        description: '文档内容可能不够详细',
        check: (content) => {
          const wordCount = content.split(/\s+/).length;
          return { 
            matched: wordCount < 100, 
            details: `文档仅有约 ${wordCount} 个词`,
            suggestion: '补充更多细节描述' 
          };
        },
      },
      {
        id: 'undefined-terms',
        category: 'clarity',
        severity: 'info',
        title: '使用了未定义的术语',
        description: '文档中使用了可能需要解释的专业术语',
        check: (content) => {
          // 检查是否使用了缩写但没有解释
          const acronyms = content.match(/\b[A-Z]{2,6}\b/g);
          const explainedPattern = /([A-Z]{2,6})\s*[（(]|[（(]\s*([A-Z]{2,6})\s*[）)]/g;
          if (acronyms && acronyms.length > 3) {
            const unexplained = acronyms.filter(a => !explainedPattern.test(content.slice(content.indexOf(a) - 50, content.indexOf(a) + 50)));
            if (unexplained.length > 2) {
              return { 
                matched: true, 
                details: `发现多个可能需要解释的缩写: ${[...new Set(unexplained)].slice(0, 5).join(', ')}`,
                suggestion: '确保首次使用时解释专业术语和缩写' 
              };
            }
          }
          return { matched: false };
        },
      },
    ];
  }
}

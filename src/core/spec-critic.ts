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
import type { ProjectContextRef } from './project-context.js';

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
  private ref: ProjectContextRef;
  private rules: CritiqueRule[];

  constructor(options: { ref: ProjectContextRef }) {
    this.ref = options.ref;
    this.rules = this.initializeRules();
  }

  /**
   * 获取评审结果存储目录
   */
  private getCritiquesDir(): string {
    return path.join(this.ref.current, 'openspec', 'critiques');
  }

  /**
   * 获取变更目录
   */
  private getChangeDir(changeName: string): string {
    const safeId = this.ensureSafeId(changeName);
    return path.join(this.ref.current, 'openspec', 'changes', safeId);
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
      suggestions.push('Agrega las secciones faltantes del documento, asegurando que la descripción del problema, la solución y el alcance estén completos');
    }
    
    if ((byCategory.get('security')?.length || 0) > 0) {
      suggestions.push('Revisa el diseño de seguridad, asegurando que los mecanismos de autenticación, autorización y validación de datos estén implementados');
    }
    
    if ((byCategory.get('edge_case')?.length || 0) > 0) {
      suggestions.push('Agrega una sección sobre casos límite y manejo de errores');
    }
    
    if ((byCategory.get('clarity')?.length || 0) > 0) {
      suggestions.push('Mejora la claridad del documento, unificando el uso de la terminología');
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
        title: 'Falta descripción del problema',
        description: 'El documento debe incluir una sección clara que describa el problema',
        check: (content, sections) => {
          const hasProb = content.toLowerCase().includes('problem') ||
                          content.toLowerCase().includes('issue') ||
                          content.toLowerCase().includes('背景') ||
                          content.toLowerCase().includes('问题') ||
                          sections.has('problem') ||
                          sections.has('background');
          return { matched: !hasProb, suggestion: 'Agrega una sección "Problem" o "Antecedentes" que describa el problema a resolver' };
        },
      },
      {
        id: 'missing-solution',
        category: 'completeness',
        severity: 'critical',
        title: 'Falta solución',
        description: 'El documento debe incluir una descripción de la solución',
        check: (content, sections) => {
          const hasSol = content.toLowerCase().includes('solution') ||
                         content.toLowerCase().includes('approach') ||
                         content.toLowerCase().includes('解决方案') ||
                         content.toLowerCase().includes('方案') ||
                         sections.has('solution') ||
                         sections.has('approach') ||
                         sections.has('design');
          return { matched: !hasSol, suggestion: 'Agrega una sección "Solution" o "Solución"' };
        },
      },
      {
        id: 'missing-impact',
        category: 'completeness',
        severity: 'warning',
        title: 'Falta alcance del impacto',
        description: 'El documento debe describir el alcance del impacto del cambio',
        check: (content) => {
          const hasImpact = content.toLowerCase().includes('impact') ||
                           content.toLowerCase().includes('scope') ||
                           content.toLowerCase().includes('影响') ||
                           content.toLowerCase().includes('范围');
          return { matched: !hasImpact, suggestion: 'Agrega una sección "Impact" o "Alcance del impacto"' };
        },
      },
      
      // --- 技术可行性 ---
      {
        id: 'no-code-reference',
        category: 'feasibility',
        severity: 'info',
        title: 'Falta referencia al código',
        description: 'El documento de diseño debe referenciar archivos de código relacionados',
        check: (content) => {
          const hasCodeRef = /`[A-Za-z_][\w/.-]+\.(ts|js|go|py|java|tsx|jsx)`/.test(content) ||
                            content.includes('file://') ||
                            /\b(src|lib|pkg|internal)\//.test(content);
          return { matched: !hasCodeRef, suggestion: 'Agrega referencias a archivos de código relacionados para su implementación' };
        },
      },
      {
        id: 'todo-placeholder',
        category: 'feasibility',
        severity: 'warning',
        title: 'Hay marcadores TODO pendientes',
        description: 'El documento contiene marcadores TODO sin completar',
        check: (content) => {
          const todoMatch = content.match(/\bTODO\b|\bFIXME\b|\bTBD\b|\bXXX\b/gi);
          if (todoMatch && todoMatch.length > 0) {
            return { 
              matched: true, 
              details: `Se encontraron ${todoMatch.length} marcadores TODO/TBD`,
              suggestion: 'Completa todos los TODO antes de solicitar aprobación' 
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
        title: 'No se menciona autenticación/autorización',
        description: 'Los cambios relacionados con API o usuarios deben explicar la estrategia de autenticación/autorización',
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
            suggestion: 'Agrega una sección sobre autenticación y autorización' 
          };
        },
      },
      {
        id: 'sensitive-data',
        category: 'security',
        severity: 'critical',
        title: 'Datos sensibles detectados',
        description: 'Los cambios con datos sensibles requieren medidas de seguridad explícitas',
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
                details: 'El documento contiene datos sensibles y no tiene una sección de seguridad. Asegúrate de incluir medidas de seguridad apropiadas',
                suggestion: 'Agrega una sección "Security" que describa las medidas de protección de datos' 
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
        title: 'No se menciona manejo de errores',
        description: 'Debe explicar el manejo de excepciones y errores',
        check: (content) => {
          const hasError = content.toLowerCase().includes('error') ||
                          content.toLowerCase().includes('exception') ||
                          content.toLowerCase().includes('failure') ||
                          content.toLowerCase().includes('错误') ||
                          content.toLowerCase().includes('异常') ||
                          content.toLowerCase().includes('失败');
          return { matched: !hasError, suggestion: 'Agrega una sección sobre manejo de errores y excepciones' };
        },
      },
      {
        id: 'no-concurrency',
        category: 'edge_case',
        severity: 'info',
        title: 'No se considera concurrencia',
        description: 'Los cambios que involucran actualizaciones de datos deben considerar la concurrencia',
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
            suggestion: 'Considera agregar una sección sobre control de concurrencia' 
          };
        },
      },
      
      // --- 清晰度 ---
      {
        id: 'too-short',
        category: 'clarity',
        severity: 'warning',
        title: 'Documento muy corto',
        description: 'El contenido del documento puede no ser lo suficientemente detallado',
        check: (content) => {
          const wordCount = content.split(/\s+/).length;
          return { 
            matched: wordCount < 100, 
            details: `El documento tiene aproximadamente ${wordCount} palabras`,
            suggestion: 'Agrega más detalles descriptivos' 
          };
        },
      },
      {
        id: 'undefined-terms',
        category: 'clarity',
        severity: 'info',
        title: 'Términos no definidos en uso',
        description: 'El documento usa términos especializados que podrían necesitar explicación',
        check: (content) => {
          // 检查是否使用了缩写但没有解释
          const acronyms = content.match(/\b[A-Z]{2,6}\b/g);
          const explainedPattern = /([A-Z]{2,6})\s*[（(]|[（(]\s*([A-Z]{2,6})\s*[）)]/g;
          if (acronyms && acronyms.length > 3) {
            const unexplained = acronyms.filter(a => !explainedPattern.test(content.slice(content.indexOf(a) - 50, content.indexOf(a) + 50)));
            if (unexplained.length > 2) {
              return { 
                matched: true, 
                details: `Se encontraron múltiples siglas que pueden necesitar explicación: ${[...new Set(unexplained)].slice(0, 5).join(', ')}`,
                suggestion: 'Asegúrate de explicar términos especializados y siglas la primera vez que se usen' 
              };
            }
          }
          return { matched: false };
        },
      },
    ];
  }
}

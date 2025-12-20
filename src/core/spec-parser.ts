/**
 * Spec 依赖解析器
 * 解析 Spec 之间的依赖关系并生成可视化图表
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface SpecNode {
  id: string;
  title: string;
}

export interface SpecEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: SpecNode[];
  edges: SpecEdge[];
}

export class SpecParser {
  private cwd: string;

  constructor(options?: { cwd?: string }) {
    this.cwd = options?.cwd || process.cwd();
  }

  /**
   * 获取 specs 目录
   */
  private getSpecsDir(): string {
    return path.join(this.cwd, 'openspec', 'specs');
  }

  /**
   * 解析单个 Spec 的依赖
   * 
   * 支持的格式：
   * <!-- @depends-on: spec-a, spec-b -->
   * <!-- @requires: spec-c -->
   */
  async parseDependencies(specId: string): Promise<string[]> {
    const specPath = path.join(this.getSpecsDir(), specId, 'spec.md');
    
    try {
      const content = await fs.readFile(specPath, 'utf-8');
      const dependencies: string[] = [];

      // 匹配 @depends-on 或 @requires 注释
      const dependsMatch = content.match(/<!--\s*@(?:depends-on|requires):\s*([^-]+)\s*-->/gi);
      
      if (dependsMatch) {
        for (const match of dependsMatch) {
          const deps = match
            .replace(/<!--\s*@(?:depends-on|requires):\s*/i, '')
            .replace(/\s*-->/, '')
            .split(',')
            .map((d) => d.trim())
            .filter((d) => d.length > 0);
          dependencies.push(...deps);
        }
      }

      return [...new Set(dependencies)]; // 去重
    } catch {
      return [];
    }
  }

  /**
   * 获取 Spec 标题
   */
  async getSpecTitle(specId: string): Promise<string> {
    const specPath = path.join(this.getSpecsDir(), specId, 'spec.md');
    
    try {
      const content = await fs.readFile(specPath, 'utf-8');
      const titleMatch = content.match(/^#\s+(.+)/m);
      return titleMatch ? titleMatch[1].trim() : specId;
    } catch {
      return specId;
    }
  }

  /**
   * 构建完整依赖图
   */
  async buildDependencyGraph(): Promise<DependencyGraph> {
    const nodes: SpecNode[] = [];
    const edges: SpecEdge[] = [];
    const specsDir = this.getSpecsDir();

    try {
      const entries = await fs.readdir(specsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const specId = entry.name;
        const title = await this.getSpecTitle(specId);
        nodes.push({ id: specId, title });

        // 解析依赖
        const dependencies = await this.parseDependencies(specId);
        for (const dep of dependencies) {
          edges.push({ from: specId, to: dep });
        }
      }
    } catch {
      // specs 目录不存在
    }

    return { nodes, edges };
  }

  /**
   * 生成 Mermaid 格式的依赖图
   */
  async toMermaid(): Promise<string> {
    const graph = await this.buildDependencyGraph();

    if (graph.nodes.length === 0) {
      return 'graph LR\n  NoSpecs[No specs found]';
    }

    let mermaid = 'graph LR\n';

    // 添加节点定义（使用标题）
    for (const node of graph.nodes) {
      const safeTitle = node.title.replace(/"/g, "'");
      mermaid += `  ${node.id}["${safeTitle}"]\n`;
    }

    // 添加边
    if (graph.edges.length > 0) {
      mermaid += '\n';
      for (const edge of graph.edges) {
        mermaid += `  ${edge.from} --> ${edge.to}\n`;
      }
    }

    return mermaid;
  }

  /**
   * 获取某个 Spec 的依赖链（递归解析）
   */
  async getDependencyChain(specId: string, visited = new Set<string>()): Promise<string[]> {
    if (visited.has(specId)) {
      return []; // 避免循环依赖
    }
    visited.add(specId);

    const directDeps = await this.parseDependencies(specId);
    const allDeps: string[] = [...directDeps];

    for (const dep of directDeps) {
      const transitiveDeps = await this.getDependencyChain(dep, visited);
      allDeps.push(...transitiveDeps);
    }

    return [...new Set(allDeps)];
  }
}

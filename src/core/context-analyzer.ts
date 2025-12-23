/**
 * Context Analyzer - 项目上下文分析模块
 * 
 * 分析项目结构、技术栈、代码模式，让用户看到 AI 对项目的理解
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 语言信息
 */
export interface LanguageInfo {
  name: string;
  percentage: number;
  fileCount: number;
  lineCount: number;
}

/**
 * 目录信息
 */
export interface DirectoryInfo {
  name: string;
  purpose: string;
  fileCount: number;
  path: string;
}

/**
 * 项目上下文
 */
export interface ProjectContext {
  // 技术栈
  stack: {
    languages: LanguageInfo[];
    frameworks: string[];
    packageManager: string;
    buildTools: string[];
    testFramework?: string;
  };

  // 结构
  structure: {
    rootFiles: string[];
    mainDirectories: DirectoryInfo[];
    entryPoints: string[];
  };

  // 模式
  patterns: {
    architecture: string;
    codeStyle: string[];
    conventions: string[];
  };

  // 统计
  stats: {
    totalFiles: number;
    totalLines: number;
    byLanguage: Record<string, number>;
  };

  // 元数据
  analyzedAt: string;
  projectRoot: string;
  projectName: string;
}

// 语言扩展名映射
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.go': 'Go',
  '.py': 'Python',
  '.java': 'Java',
  '.rs': 'Rust',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.less': 'Less',
  '.html': 'HTML',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.md': 'Markdown',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
};

// 目录用途推断
const DIRECTORY_PURPOSES: Record<string, string> = {
  src: '源代码',
  lib: '库代码',
  pkg: 'Go 包',
  internal: '内部模块',
  cmd: '命令行入口',
  api: 'API 接口',
  server: '服务器代码',
  client: '客户端代码',
  web: 'Web 前端',
  app: '应用入口',
  components: 'UI 组件',
  pages: '页面组件',
  routes: '路由定义',
  controllers: '控制器',
  services: '服务层',
  models: '数据模型',
  utils: '工具函数',
  helpers: '辅助函数',
  hooks: 'React Hooks',
  store: '状态管理',
  types: '类型定义',
  tests: '测试文件',
  __tests__: '测试文件',
  test: '测试文件',
  spec: '规格文件',
  docs: '文档',
  scripts: '脚本',
  config: '配置文件',
  assets: '静态资源',
  public: '公共资源',
  static: '静态文件',
  dist: '构建输出',
  build: '构建输出',
  out: '输出目录',
  node_modules: 'npm 依赖',
  vendor: '第三方依赖',
};

/**
 * ContextAnalyzer 主类
 */
export class ContextAnalyzer {
  private cwd: string;
  private cachedContext: ProjectContext | null = null;

  constructor(options?: { cwd?: string }) {
    this.cwd = options?.cwd || process.cwd();
  }

  /**
   * 获取缓存目录
   */
  private getCacheDir(): string {
    return path.join(this.cwd, 'openspec', '.cache');
  }

  /**
   * 分析项目上下文
   */
  async analyze(): Promise<ProjectContext> {
    const projectName = path.basename(this.cwd);
    
    // 获取项目文件列表（排除常见忽略目录）
    const files = await this.scanFiles(this.cwd);
    
    // 分析语言分布
    const languages = await this.analyzeLanguages(files);
    
    // 分析目录结构
    const structure = await this.analyzeStructure();
    
    // 检测技术栈
    const stack = await this.detectStack(languages);
    
    // 检测模式
    const patterns = await this.detectPatterns();
    
    // 计算统计
    const stats = this.calculateStats(files, languages);
    
    const context: ProjectContext = {
      stack,
      structure,
      patterns,
      stats,
      analyzedAt: new Date().toISOString(),
      projectRoot: this.cwd,
      projectName,
    };
    
    // 缓存结果
    this.cachedContext = context;
    await this.saveContext(context);
    
    return context;
  }

  /**
   * 获取缓存的上下文
   */
  async getCachedContext(): Promise<ProjectContext | null> {
    if (this.cachedContext) {
      return this.cachedContext;
    }
    
    const cachePath = path.join(this.getCacheDir(), 'context.json');
    try {
      const content = await fs.readFile(cachePath, 'utf-8');
      this.cachedContext = JSON.parse(content);
      return this.cachedContext;
    } catch {
      return null;
    }
  }

  /**
   * 刷新上下文
   */
  async refreshContext(): Promise<ProjectContext> {
    this.cachedContext = null;
    return this.analyze();
  }

  /**
   * 扫描文件
   */
  private async scanFiles(dir: string, prefix = ''): Promise<string[]> {
    const files: string[] = [];
    const ignorePatterns = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.cache', 'vendor'];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const name = entry.name;
        const relativePath = path.join(prefix, name);
        
        if (entry.isDirectory()) {
          // 跳过忽略的目录
          if (ignorePatterns.includes(name) || name.startsWith('.')) {
            continue;
          }
          
          // 限制递归深度
          if (relativePath.split(path.sep).length < 5) {
            const subFiles = await this.scanFiles(path.join(dir, name), relativePath);
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          files.push(relativePath);
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
    
    return files;
  }

  /**
   * 分析语言分布
   */
  private async analyzeLanguages(files: string[]): Promise<LanguageInfo[]> {
    const langStats: Record<string, { files: number; lines: number }> = {};
    let totalLines = 0;
    
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const lang = LANGUAGE_EXTENSIONS[ext];
      
      if (lang) {
        if (!langStats[lang]) {
          langStats[lang] = { files: 0, lines: 0 };
        }
        langStats[lang].files++;
        
        // 估算行数（实际计数会太慢）
        try {
          const stat = await fs.stat(path.join(this.cwd, file));
          const estimatedLines = Math.round(stat.size / 40); // 估算每行 40 字符
          langStats[lang].lines += estimatedLines;
          totalLines += estimatedLines;
        } catch {
          // 忽略
        }
      }
    }
    
    // 转换为数组并计算百分比
    return Object.entries(langStats)
      .map(([name, stats]) => ({
        name,
        fileCount: stats.files,
        lineCount: stats.lines,
        percentage: totalLines > 0 ? Math.round((stats.lines / totalLines) * 100) : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 10); // 最多返回 10 种语言
  }

  /**
   * 分析目录结构
   */
  private async analyzeStructure(): Promise<ProjectContext['structure']> {
    const rootFiles: string[] = [];
    const mainDirectories: DirectoryInfo[] = [];
    const entryPoints: string[] = [];
    
    try {
      const entries = await fs.readdir(this.cwd, { withFileTypes: true });
      
      for (const entry of entries) {
        const name = entry.name;
        
        if (entry.isFile()) {
          // 跳过隐藏文件
          if (!name.startsWith('.')) {
            rootFiles.push(name);
          }
          
          // 检测入口点
          if (['index.ts', 'index.js', 'main.ts', 'main.js', 'main.go', 'app.py', 'main.py'].includes(name)) {
            entryPoints.push(name);
          }
        } else if (entry.isDirectory() && !name.startsWith('.') && !['node_modules', 'vendor'].includes(name)) {
          const purpose = DIRECTORY_PURPOSES[name.toLowerCase()] || '项目目录';
          
          // 计算文件数
          let fileCount = 0;
          try {
            const subFiles = await this.scanFiles(path.join(this.cwd, name));
            fileCount = subFiles.length;
          } catch {
            // 忽略
          }
          
          if (fileCount > 0) {
            mainDirectories.push({
              name,
              purpose,
              fileCount,
              path: name,
            });
          }
        }
      }
    } catch {
      // 忽略
    }
    
    // 检查 src 目录下的入口点
    try {
      const srcEntries = await fs.readdir(path.join(this.cwd, 'src'), { withFileTypes: true });
      for (const entry of srcEntries) {
        if (entry.isFile() && ['index.ts', 'index.js', 'main.ts', 'main.js'].includes(entry.name)) {
          entryPoints.push(`src/${entry.name}`);
        }
      }
    } catch {
      // src 目录不存在
    }
    
    return {
      rootFiles: rootFiles.slice(0, 20),
      mainDirectories: mainDirectories.sort((a, b) => b.fileCount - a.fileCount).slice(0, 10),
      entryPoints,
    };
  }

  /**
   * 检测技术栈
   */
  private async detectStack(languages: LanguageInfo[]): Promise<ProjectContext['stack']> {
    const frameworks: string[] = [];
    let packageManager = 'unknown';
    const buildTools: string[] = [];
    let testFramework: string | undefined;
    
    // 检测 package.json
    try {
      const pkgContent = await fs.readFile(path.join(this.cwd, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgContent);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      packageManager = 'npm';
      
      // 检测框架
      if (allDeps['react']) frameworks.push('React');
      if (allDeps['vue']) frameworks.push('Vue');
      if (allDeps['@angular/core']) frameworks.push('Angular');
      if (allDeps['svelte']) frameworks.push('Svelte');
      if (allDeps['next']) frameworks.push('Next.js');
      if (allDeps['nuxt']) frameworks.push('Nuxt');
      if (allDeps['express']) frameworks.push('Express');
      if (allDeps['fastify']) frameworks.push('Fastify');
      if (allDeps['koa']) frameworks.push('Koa');
      if (allDeps['nestjs'] || allDeps['@nestjs/core']) frameworks.push('NestJS');
      
      // 检测构建工具
      if (allDeps['typescript']) buildTools.push('TypeScript');
      if (allDeps['vite']) buildTools.push('Vite');
      if (allDeps['webpack']) buildTools.push('Webpack');
      if (allDeps['esbuild']) buildTools.push('esbuild');
      if (allDeps['rollup']) buildTools.push('Rollup');
      
      // 检测测试框架
      if (allDeps['vitest']) testFramework = 'Vitest';
      else if (allDeps['jest']) testFramework = 'Jest';
      else if (allDeps['mocha']) testFramework = 'Mocha';
    } catch {
      // package.json 不存在
    }
    
    // 检测 go.mod
    try {
      await fs.access(path.join(this.cwd, 'go.mod'));
      frameworks.push('Go');
      packageManager = 'go modules';
    } catch {
      // 不是 Go 项目
    }
    
    // 检测 requirements.txt 或 pyproject.toml
    try {
      await fs.access(path.join(this.cwd, 'requirements.txt'));
      packageManager = 'pip';
    } catch {
      try {
        await fs.access(path.join(this.cwd, 'pyproject.toml'));
        packageManager = 'poetry/pip';
      } catch {
        // 不是 Python 项目
      }
    }
    
    return {
      languages,
      frameworks,
      packageManager,
      buildTools,
      testFramework,
    };
  }

  /**
   * 检测代码模式
   */
  private async detectPatterns(): Promise<ProjectContext['patterns']> {
    let architecture = 'unknown';
    const codeStyle: string[] = [];
    const conventions: string[] = [];
    
    // 检测架构类型
    try {
      const entries = await fs.readdir(this.cwd, { withFileTypes: true });
      const dirNames = entries.filter(e => e.isDirectory()).map(e => e.name);
      
      if (dirNames.includes('packages') || dirNames.includes('apps')) {
        architecture = 'monorepo';
      } else if (dirNames.includes('cmd') && dirNames.includes('internal')) {
        architecture = 'Go standard layout';
      } else if (dirNames.includes('src') && dirNames.includes('web')) {
        architecture = 'MCP Server + Dashboard';
      } else if (dirNames.includes('src')) {
        architecture = 'standard';
      }
    } catch {
      // 忽略
    }
    
    // 检测代码风格配置
    const styleFiles = [
      ['.eslintrc', 'ESLint'],
      ['.eslintrc.js', 'ESLint'],
      ['.eslintrc.json', 'ESLint'],
      ['eslint.config.js', 'ESLint'],
      ['.prettierrc', 'Prettier'],
      ['prettier.config.js', 'Prettier'],
      ['.editorconfig', 'EditorConfig'],
      ['tsconfig.json', 'TypeScript'],
      ['.stylelintrc', 'Stylelint'],
    ];
    
    for (const [file, tool] of styleFiles) {
      try {
        await fs.access(path.join(this.cwd, file));
        if (!codeStyle.includes(tool)) {
          codeStyle.push(tool);
        }
      } catch {
        // 文件不存在
      }
    }
    
    // 检测约定
    try {
      await fs.access(path.join(this.cwd, '.github'));
      conventions.push('GitHub workflows');
    } catch { /* 忽略 */ }
    
    try {
      await fs.access(path.join(this.cwd, 'openspec'));
      conventions.push('OpenSpec');
    } catch { /* 忽略 */ }
    
    try {
      await fs.access(path.join(this.cwd, '.husky'));
      conventions.push('Husky git hooks');
    } catch { /* 忽略 */ }
    
    return { architecture, codeStyle, conventions };
  }

  /**
   * 计算统计数据
   */
  private calculateStats(files: string[], languages: LanguageInfo[]): ProjectContext['stats'] {
    const byLanguage: Record<string, number> = {};
    
    for (const lang of languages) {
      byLanguage[lang.name] = lang.lineCount;
    }
    
    return {
      totalFiles: files.length,
      totalLines: languages.reduce((sum, l) => sum + l.lineCount, 0),
      byLanguage,
    };
  }

  /**
   * 保存上下文
   */
  private async saveContext(context: ProjectContext): Promise<void> {
    const cacheDir = this.getCacheDir();
    try {
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, 'context.json'),
        JSON.stringify(context, null, 2),
        'utf-8'
      );
    } catch {
      // 忽略保存错误
    }
  }

  /**
   * 获取 project.md 内容
   */
  async getProjectMd(): Promise<string | null> {
    const projectMdPath = path.join(this.cwd, 'openspec', 'project.md');
    try {
      return await fs.readFile(projectMdPath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 获取关键文件内容（用于 AI 分析）
   */
  async getKeyFiles(): Promise<Record<string, string>> {
    const keyFiles: Record<string, string> = {};
    const filesToCheck = [
      'package.json',
      'go.mod',
      'README.md',
      'openspec/project.md',
    ];
    
    for (const file of filesToCheck) {
      try {
        const content = await fs.readFile(path.join(this.cwd, file), 'utf-8');
        keyFiles[file] = content.slice(0, 2000); // 限制长度
      } catch {
        // 文件不存在，跳过
      }
    }
    
    return keyFiles;
  }
}

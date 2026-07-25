/**
 * Context Analyzer - 项目上下文分析模块
 * 
 * 分析项目结构、技术栈、代码模式，让用户看到 AI 对项目的理解
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ProjectContextRef } from './project-context.js';

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
  src: 'Código fuente',
  lib: 'Librerías',
  pkg: 'Paquetes Go',
  internal: 'Módulos internos',
  cmd: 'CLI de entrada',
  api: 'Interfaz API',
  server: 'Código del servidor',
  client: 'Código del cliente',
  web: 'Frontend Web',
  app: 'Punto de entrada',
  components: 'Componentes UI',
  pages: 'Componentes de página',
  routes: 'Definición de rutas',
  controllers: 'Controladores',
  services: 'Capa de servicios',
  models: 'Modelos de datos',
  utils: 'Funciones utilitarias',
  helpers: 'Funciones auxiliares',
  hooks: 'Hooks de React',
  store: 'Gestión de estado',
  types: 'Definiciones de tipos',
  tests: 'Pruebas',
  __tests__: 'Pruebas',
  test: 'Pruebas',
  spec: 'Archivos de especificación',
  docs: 'Documentación',
  scripts: 'Scripts',
  config: 'Configuración',
  assets: 'Recursos estáticos',
  public: 'Recursos públicos',
  static: 'Archivos estáticos',
  dist: 'Salida de compilación',
  build: 'Salida de compilación',
  out: 'Directorio de salida',
  node_modules: 'Dependencias npm',
  vendor: 'Dependencias de terceros',
};

/**
 * ContextAnalyzer 主类
 */
export class ContextAnalyzer {
  private ref: ProjectContextRef;
  private cachedContext: ProjectContext | null = null;

  constructor(options: { ref: ProjectContextRef }) {
    this.ref = options.ref;
  }

  /**
   * 获取缓存目录
   */
  private getCacheDir(): string {
    return path.join(this.ref.current, 'openspec', '.cache');
  }

  /**
   * 分析项目上下文
   */
  async analyze(): Promise<ProjectContext> {
    const projectName = path.basename(this.ref.current);
    
    // 获取项目文件列表（排除常见忽略目录）
    const files = await this.scanFiles(this.ref.current);
    
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
      projectRoot: this.ref.current,
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
          const stat = await fs.stat(path.join(this.ref.current, file));
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
      const entries = await fs.readdir(this.ref.current, { withFileTypes: true });
      
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
          const purpose = DIRECTORY_PURPOSES[name.toLowerCase()] || 'Directorio del proyecto';
          
          // 计算文件数
          let fileCount = 0;
          try {
            const subFiles = await this.scanFiles(path.join(this.ref.current, name));
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
      const srcEntries = await fs.readdir(path.join(this.ref.current, 'src'), { withFileTypes: true });
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
      const pkgContent = await fs.readFile(path.join(this.ref.current, 'package.json'), 'utf-8');
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
      await fs.access(path.join(this.ref.current, 'go.mod'));
      frameworks.push('Go');
      packageManager = 'go modules';
    } catch {
      // 不是 Go 项目
    }
    
    // 检测 requirements.txt 或 pyproject.toml
    try {
      await fs.access(path.join(this.ref.current, 'requirements.txt'));
      packageManager = 'pip';
    } catch {
      try {
        await fs.access(path.join(this.ref.current, 'pyproject.toml'));
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
      const entries = await fs.readdir(this.ref.current, { withFileTypes: true });
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
        await fs.access(path.join(this.ref.current, file));
        if (!codeStyle.includes(tool)) {
          codeStyle.push(tool);
        }
      } catch {
        // 文件不存在
      }
    }
    
    // 检测约定
    try {
      await fs.access(path.join(this.ref.current, '.github'));
      conventions.push('GitHub workflows');
    } catch { /* 忽略 */ }
    
    try {
      await fs.access(path.join(this.ref.current, 'openspec'));
      conventions.push('OpenSpec');
    } catch { /* 忽略 */ }
    
    try {
      await fs.access(path.join(this.ref.current, '.husky'));
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
    const projectMdPath = path.join(this.ref.current, 'openspec', 'project.md');
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
        const content = await fs.readFile(path.join(this.ref.current, file), 'utf-8');
        keyFiles[file] = content.slice(0, 2000); // 限制长度
      } catch {
        // 文件不存在，跳过
      }
    }
    
    return keyFiles;
  }
}

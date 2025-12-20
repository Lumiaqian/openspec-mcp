#!/usr/bin/env node

/**
 * OpenSpec MCP Server
 *
 * MCP server for OpenSpec - spec-driven development with
 * real-time dashboard and approval workflow
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Command } from 'commander';
import { OpenSpecCli } from './core/openspec-cli.js';
import { ApprovalManager } from './core/approval-manager.js';
import { ReviewManager } from './core/review-manager.js';
import { TemplateManager } from './core/template-manager.js';
import { HooksManager } from './core/hooks-manager.js';
import { ProposalGenerator } from './core/proposal-generator.js';
import { registerGuidesTools } from './server/tools/guides.js';
import { registerManagementTools } from './server/tools/management.js';
import { registerValidationTools } from './server/tools/validation.js';
import { registerArchiveTools } from './server/tools/archive.js';
import { registerTasksTools } from './server/tools/tasks.js';
import { registerApprovalTools } from './server/tools/approval.js';
import { registerReviewTools } from './server/tools/reviews.js';
import { registerTemplatesTools } from './server/tools/templates.js';
import { registerHooksTools } from './server/tools/hooks.js';
import { registerGeneratorTools } from './server/tools/generator.js';
import { VERSION } from './utils/version.js';

/**
 * 创建并配置 MCP Server
 */
function createMcpServer(cwd: string): McpServer {
  const server = new McpServer({
    name: 'openspec-mcp',
    version: VERSION,
  });

  // 创建核心模块实例
  const cli = new OpenSpecCli({ cwd });
  const approvalManager = new ApprovalManager({ cwd });
  const reviewManager = new ReviewManager({ cwd });
  const templateManager = new TemplateManager({ cwd });
  const hooksManager = new HooksManager({ cwd });
  const proposalGenerator = new ProposalGenerator({ cwd });

  // 注册所有工具
  registerGuidesTools(server, cli);
  registerManagementTools(server, cli);
  registerValidationTools(server, cli);
  registerArchiveTools(server, cli);
  registerTasksTools(server, cli);
  registerApprovalTools(server, approvalManager);
  registerReviewTools(server, reviewManager);
  registerTemplatesTools(server, templateManager);
  registerHooksTools(server, hooksManager);
  registerGeneratorTools(server, proposalGenerator);

  return server;
}

/**
 * 启动 MCP Server (stdio 模式)
 */
async function startMcpServer(cwd: string): Promise<void> {
  const server = createMcpServer(cwd);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error(`OpenSpec MCP Server v${VERSION} started`);
  console.error(`Working directory: ${cwd}`);
}

/**
 * 启动 Dashboard (HTTP 模式)
 */
async function startDashboard(cwd: string, port: number): Promise<void> {
  const { startApiServer } = await import('./api/server.js');
  await startApiServer({ cwd, port });
}

/**
 * CLI 入口
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('openspec-mcp')
    .description('MCP server for OpenSpec - spec-driven development')
    .version(VERSION)
    .argument('[path]', 'Project directory path', process.cwd())
    .option('--dashboard', 'Start web dashboard instead of MCP server')
    .option('--with-dashboard', 'Start MCP server with web dashboard')
    .option('-p, --port <number>', 'Dashboard port', '3000')
    .action(async (projectPath: string, options: { dashboard?: boolean; withDashboard?: boolean; port: string }) => {
      const cwd = projectPath.startsWith('/')
        ? projectPath
        : `${process.cwd()}/${projectPath}`;

      if (options.dashboard) {
        // 仅 Dashboard 模式
        await startDashboard(cwd, parseInt(options.port, 10));
      } else if (options.withDashboard) {
        // MCP + Dashboard 模式
        startDashboard(cwd, parseInt(options.port, 10)).catch(console.error);
        await startMcpServer(cwd);
      } else {
        // 仅 MCP 模式
        await startMcpServer(cwd);
      }
    });

  await program.parseAsync(process.argv);
}

// 运行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

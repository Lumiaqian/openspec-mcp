/**
 * Fastify HTTP API Server
 * 提供 REST API 和 WebSocket 实时更新
 */

import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { OpenSpecCli } from '../core/openspec-cli.js';
import { ApprovalManager } from '../core/approval-manager.js';
import { FileWatcher } from '../core/file-watcher.js';
import { registerChangesRoutes } from './routes/changes.js';
import { registerSpecsRoutes } from './routes/specs.js';
import { registerTasksRoutes } from './routes/tasks.js';
import { registerApprovalsRoutes } from './routes/approvals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ApiServerOptions {
  cwd: string;
  port: number;
}

export interface ApiContext {
  cli: OpenSpecCli;
  approvalManager: ApprovalManager;
  fileWatcher: FileWatcher;
  broadcast: (event: string, data: any) => void;
}

/**
 * 创建并启动 API 服务器
 */
export async function startApiServer(options: ApiServerOptions): Promise<FastifyInstance> {
  const { cwd, port } = options;

  // 创建 Fastify 实例
  const fastify = Fastify({
    logger: true,
  });

  // 注册插件
  await fastify.register(fastifyCors, {
    origin: true,
  });

  await fastify.register(fastifyWebsocket);

  // 静态文件服务（Web Dashboard）
  const webDir = path.join(__dirname, '../../web/dist');
  try {
    await fastify.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
    });
  } catch {
    // Web dashboard 可能未构建
    console.log('Web dashboard not found, skipping static files');
  }

  // 创建核心模块
  const cli = new OpenSpecCli({ cwd });
  const approvalManager = new ApprovalManager({ cwd });
  const fileWatcher = new FileWatcher({ cwd });

  // WebSocket 客户端列表
  const wsClients = new Set<any>();

  // 广播函数
  const broadcast = (event: string, data: any) => {
    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    for (const client of wsClients) {
      if (client.readyState === 1) {
        // OPEN
        client.send(message);
      }
    }
  };

  // API 上下文
  const ctx: ApiContext = {
    cli,
    approvalManager,
    fileWatcher,
    broadcast,
  };

  // 注册 WebSocket 路由
  fastify.get('/ws', { websocket: true }, (connection) => {
    const { socket } = connection;

    wsClients.add(socket);
    console.log(`WebSocket client connected. Total: ${wsClients.size}`);

    // 发送欢迎消息
    socket.send(
      JSON.stringify({
        event: 'connected',
        data: { message: 'Connected to OpenSpec MCP Dashboard' },
        timestamp: new Date().toISOString(),
      })
    );

    socket.on('message', (message: any) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('WebSocket message:', data);

        // 处理订阅请求等
        if (data.type === 'subscribe') {
          // TODO: 实现订阅逻辑
        }
      } catch (e) {
        console.error('Invalid WebSocket message:', e);
      }
    });

    socket.on('close', () => {
      wsClients.delete(socket);
      console.log(`WebSocket client disconnected. Total: ${wsClients.size}`);
    });
  });

  // 注册 REST 路由
  await fastify.register(
    async (instance) => {
      registerChangesRoutes(instance, ctx);
      registerSpecsRoutes(instance, ctx);
      registerTasksRoutes(instance, ctx);
      registerApprovalsRoutes(instance, ctx);
    },
    { prefix: '/api' }
  );

  // 健康检查
  fastify.get('/health', async () => {
    return { status: 'ok', version: '0.1.0' };
  });

  // SPA fallback - 所有非 API 路由返回 index.html
  fastify.setNotFoundHandler(async (request, reply) => {
    if (!request.url.startsWith('/api/') && !request.url.startsWith('/ws')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found', statusCode: 404 });
  });

  // 启动文件监控
  fileWatcher.on('change', (event, filePath) => {
    broadcast('file:changed', { event, filePath });
  });

  await fileWatcher.start();

  // 启动服务器
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`\n🚀 OpenSpec MCP Dashboard running at http://localhost:${port}`);
    console.log(`📁 Watching: ${cwd}/openspec`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // 优雅关闭
  const shutdown = async () => {
    console.log('\nShutting down...');
    await fileWatcher.stop();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return fastify;
}

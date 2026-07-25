/**
 * Fastify HTTP API Server
 * 提供 REST API 和 WebSocket 实时更新
 */

import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import * as path from 'path';
import type { AddressInfo } from 'net';
import { fileURLToPath } from 'url';
import { OpenSpecCli } from '../core/openspec-cli.js';
import { ApprovalManager } from '../core/approval-manager.js';
import { ReviewManager } from '../core/review-manager.js';
import { FileWatcher } from '../core/file-watcher.js';
import { SpecParser } from '../core/spec-parser.js';
import { registerChangesRoutes } from './routes/changes.js';
import { registerSpecsRoutes } from './routes/specs.js';
import { registerTasksRoutes } from './routes/tasks.js';
import { registerApprovalsRoutes } from './routes/approvals.js';
import { registerProjectRoutes } from './routes/project.js';
import { registerKanbanRoutes } from './routes/kanban.js';
import { registerContextRoutes } from './routes/context.js';
import { CrossServiceManager } from '../core/cross-service-manager.js';
import { RevisionManager } from '../core/revision-manager.js';
import { VERSION } from '../utils/version.js';
import { createProjectContext } from '../core/project-context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ApiServerOptions {
  cwd: string;
  port: number;
}

export interface ApiContext {
  cli: OpenSpecCli;
  approvalManager: ApprovalManager;
  reviewManager: ReviewManager;
  revisionManager: RevisionManager;
  specParser: SpecParser;
  fileWatcher: FileWatcher;
  crossServiceManager: CrossServiceManager;
  cwd: string;
  broadcast: (event: string, data: any, topic?: string) => void;
}

const MAX_PORT_ATTEMPTS = 20;

function isAddressInUse(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'EADDRINUSE'
  );
}

function resolveActualPort(instance: FastifyInstance, fallback: number): number {
  const address = instance.server.address();
  if (address && typeof address === 'object') {
    return (address as AddressInfo).port ?? fallback;
  }
  return fallback;
}

async function listenWithFallback(instance: FastifyInstance, preferredPort: number): Promise<number> {
  if (preferredPort === 0) {
    await instance.listen({ port: 0, host: '0.0.0.0' });
    return resolveActualPort(instance, preferredPort);
  }

  let port = preferredPort;
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt += 1) {
    try {
      await instance.listen({ port, host: '0.0.0.0' });
      return resolveActualPort(instance, port);
    } catch (error) {
      if (!isAddressInUse(error)) {
        throw error;
      }
      port += 1;
    }
  }

  throw new Error(`No available port found starting from ${preferredPort}`);
}

import { spawn } from 'child_process';

/**
 * 自动打开浏览器
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  
  let cmd: string;
  let args: string[];
  
  if (platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // Ignorar error, la falla al abrir el navegador no afecta la ejecución del servidor
  }
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
  const ref = createProjectContext(cwd);
  const cli = new OpenSpecCli({ ref });
  const approvalManager = new ApprovalManager({ ref });
  const reviewManager = new ReviewManager({ ref });
  const specParser = new SpecParser({ ref });
  const fileWatcher = new FileWatcher({ ref });
  const crossServiceManager = new CrossServiceManager({ ref });

  // WebSocket 客户端列表
  const wsClients = new Set<any>();

  // 客户端订阅管理 (socket -> Set<topic>)
  const subscriptions = new Map<any, Set<string>>();

  // 广播函数 (支持按主题过滤)
  const broadcast = (event: string, data: any, topic?: string) => {
    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    for (const client of wsClients) {
      if (client.readyState === 1) {
        // OPEN
        // 如果指定了主题，只发送给订阅了该主题的客户端
        if (topic) {
          const clientTopics = subscriptions.get(client);
          if (clientTopics?.has(topic) || clientTopics?.has('*')) {
            client.send(message);
          }
        } else {
          client.send(message);
        }
      }
    }
  };

  // API 上下文
  const revisionManager = new RevisionManager({ ref });
  const ctx: ApiContext = {
    cli,
    approvalManager,
    reviewManager,
    revisionManager,
    specParser,
    fileWatcher,
    crossServiceManager,
    cwd,
    broadcast,
  };

  // 注册 WebSocket 路由
  fastify.get('/ws', { websocket: true }, (connection) => {
    const { socket } = connection;

    wsClients.add(socket);
    subscriptions.set(socket, new Set(['*'])); // 默认订阅所有
    fastify.log.info(`WebSocket client connected. Total: ${wsClients.size}`);

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
        fastify.log.info({ msg: 'WebSocket message', data });

        // 处理订阅请求
        if (data.type === 'subscribe') {
          const topics = (data.topics as string[]) || [];
          const clientSubs = subscriptions.get(socket) || new Set();
          topics.forEach((t) => clientSubs.add(t));
          subscriptions.set(socket, clientSubs);

          socket.send(
            JSON.stringify({
              event: 'subscribed',
              data: { topics: Array.from(clientSubs) },
              timestamp: new Date().toISOString(),
            })
          );
        }

        // 处理取消订阅
        if (data.type === 'unsubscribe') {
          const topics = (data.topics as string[]) || [];
          const clientSubs = subscriptions.get(socket);
          if (clientSubs) {
            topics.forEach((t) => clientSubs.delete(t));
          }

          socket.send(
            JSON.stringify({
              event: 'unsubscribed',
              data: { topics, remaining: clientSubs ? Array.from(clientSubs) : [] },
              timestamp: new Date().toISOString(),
            })
          );
        }
      } catch (e) {
        fastify.log.error({ msg: 'Invalid WebSocket message', error: e });
      }
    });

    socket.on('close', () => {
      wsClients.delete(socket);
      subscriptions.delete(socket);
      fastify.log.info(`WebSocket client disconnected. Total: ${wsClients.size}`);
    });
  });

  // 注册 REST 路由
  await fastify.register(
    async (instance) => {
      registerChangesRoutes(instance, ctx);
      registerSpecsRoutes(instance, ctx);
      registerTasksRoutes(instance, ctx);
      registerApprovalsRoutes(instance, ctx);
      registerProjectRoutes(instance, ctx);
      registerKanbanRoutes(instance, ctx);
      registerContextRoutes(instance, ctx);
    },
    { prefix: '/api' }
  );

  // 健康检查
  fastify.get('/health', async () => {
    return { status: 'ok', version: VERSION };
  });

  // SPA fallback - 所有非 API 路由返回 index.html
  fastify.setNotFoundHandler(async (request, reply) => {
    if (!request.url.startsWith('/api/') && !request.url.startsWith('/ws')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found', statusCode: 404 });
  });

  // 启动文件监控
  fileWatcher.on('change', (event, fileInfo) => {
    broadcast('file:changed', { event, filePath: fileInfo });
    
    // 处理 review 文件变化 - 广播 reviews:updated 事件
    if (typeof fileInfo === 'object' && fileInfo.type?.startsWith('review:')) {
      const targetType = fileInfo.type.replace('review:', '');
      const match = fileInfo.path?.match(/reviews\/changes\/([^/]+)\//);
      const changeId = match ? match[1] : null;
      
      if (changeId && ['proposal', 'design', 'tasks'].includes(targetType)) {
        broadcast('reviews:updated', { 
          changeId, 
          targetType,
          timestamp: new Date().toISOString()
        }, 'reviews');
      }
    }
    
    // 处理 change 文件变化 - 广播 change:updated 事件
    if (typeof fileInfo === 'object') {
      const type = fileInfo.type;
      
      // tasks.md 变化
      if (type === 'tasks') {
        const match = fileInfo.path?.match(/changes\/([^/]+)\/tasks\.md$/);
        const changeId = match ? match[1] : null;
        if (changeId) {
          broadcast('tasks:updated', { 
            changeId,
            timestamp: new Date().toISOString()
          }, 'tasks');
        }
      }
      
      // proposal.md 或 design.md 变化
      if (type === 'proposal' || type === 'design') {
        const match = fileInfo.path?.match(/changes\/([^/]+)\/(proposal|design)\.md$/);
        const changeId = match ? match[1] : null;
        if (changeId) {
          broadcast('change:content_updated', { 
            changeId,
            contentType: type,
            timestamp: new Date().toISOString()
          }, 'changes');
        }
      }

      // revisions.json 变化
      if (type === 'revisions') {
        const match = fileInfo.path?.match(/changes\/([^/]+)\/revisions\.json$/);
        const changeId = match ? match[1] : null;
        if (changeId) {
          broadcast('revisions:updated', { 
            changeId,
            timestamp: new Date().toISOString()
          }, 'revisions');
        }
      }

      // 跨服务文件变化 - 广播 cross-service:updated 事件
      if (type?.startsWith('cross-service')) {
        const fileName = fileInfo.path?.split('/').pop() || '';
        broadcast('cross-service:updated', { 
          fileName,
          docType: type.replace('cross-service:', ''),
          timestamp: new Date().toISOString()
        }, 'cross-service');
      }
    }
  });

  await fileWatcher.start();

  // 扫描活跃 changes 的跨服务目录并添加监控
  try {
    const changes = await cli.listChanges({ includeArchived: false });
    for (const change of changes) {
      const info = await crossServiceManager.getCrossServiceInfo(change.id);
      if (info?.config?.rootPath) {
        const changesDir = path.join(cwd, 'openspec', 'changes', change.id);
        const crossServicePath = path.resolve(changesDir, info.config.rootPath);
        fileWatcher.addCrossServicePath(crossServicePath);
      }
    }
  } catch (err) {
    console.log('No cross-service paths to watch or error scanning:', err);
  }

  // 启动服务器
  try {
    const actualPort = await listenWithFallback(fastify, port);
    if (actualPort !== port || port === 0) {
      fastify.log.warn(`Dashboard port ${port} unavailable, using ${actualPort} instead`);
    }
    const url = `http://localhost:${actualPort}`;
    console.log(`\n🚀 OpenSpec MCP Dashboard running at ${url}`);
    console.log(`📁 Watching: ${cwd}/openspec`);
    
    // 自动打开浏览器
    openBrowser(url);
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

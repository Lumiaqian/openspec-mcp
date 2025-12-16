# OpenSpec MCP

[![npm version](https://img.shields.io/npm/v/openspec-mcp)](https://www.npmjs.com/package/openspec-mcp)

[OpenSpec](https://github.com/Fission-AI/OpenSpec) 的 MCP (Model Context Protocol) 服务器 - 规格驱动开发，支持实时仪表板和审批流程。

## 功能特性

- **MCP 工具**: 将 OpenSpec CLI 完整功能暴露为 MCP 工具
- **任务追踪**: 解析 tasks.md 并实时追踪进度
- **审批流程**: 请求、批准和拒绝变更提案
- **Web 仪表板**: 可视化管理界面

## 快速开始

### 1. 添加到 MCP 配置

**Claude Code CLI（推荐，使用当前目录）:**
```bash
claude mcp add openspec -- npx openspec-mcp
```

**Claude Code CLI 带仪表板:**
```bash
claude mcp add openspec -- npx openspec-mcp --with-dashboard
```

**Claude Code CLI 指定项目路径:**
```bash
claude mcp add openspec -- npx openspec-mcp /path/to/your/project
```

**Claude Desktop / Cursor / 其他:**
```json
{
  "mcpServers": {
    "openspec": {
      "command": "npx",
      "args": ["-y", "openspec-mcp"]
    }
  }
}
```

**带仪表板:**
```json
{
  "mcpServers": {
    "openspec": {
      "command": "npx",
      "args": ["-y", "openspec-mcp", "--with-dashboard"]
    }
  }
}
```

### 2. 在对话中使用

```
# 列出所有变更
"列出所有 openspec 变更"

# 显示变更详情
"显示 add-user-auth 变更详情"

# 更新任务状态
"将 add-user-auth 中的任务 1.1 标记为完成"

# 请求审批
"向 @reviewer 请求审批 add-user-auth"
```

## 可用工具

### 指南类 (Guides)
| 工具 | 描述 |
|------|------|
| `openspec_get_instructions` | 获取 AGENTS.md 使用指南 |
| `openspec_get_project_context` | 获取 project.md 项目上下文 |

### 管理类 (Management)
| 工具 | 描述 |
|------|------|
| `openspec_list_changes` | 列出所有变更提案 |
| `openspec_list_specs` | 列出所有规格 |
| `openspec_show_change` | 显示变更详情 |
| `openspec_show_spec` | 显示规格详情 |

### 验证类 (Validation)
| 工具 | 描述 |
|------|------|
| `openspec_validate_change` | 验证单个变更 |
| `openspec_validate_spec` | 验证单个规格 |
| `openspec_validate_all` | 批量验证 |

### 归档类 (Archive)
| 工具 | 描述 |
|------|------|
| `openspec_archive_change` | 归档已完成变更 |

### 任务类 (Tasks)
| 工具 | 描述 |
|------|------|
| `openspec_get_tasks` | 获取任务列表和进度 |
| `openspec_update_task` | 更新任务状态 |
| `openspec_get_progress_summary` | 获取所有变更进度汇总 |

### 审批类 (Approval)
| 工具 | 描述 |
|------|------|
| `openspec_get_approval_status` | 获取审批状态 |
| `openspec_request_approval` | 请求审批 |
| `openspec_approve_change` | 批准变更 |
| `openspec_reject_change` | 拒绝变更 |
| `openspec_list_pending_approvals` | 列出待审批项 |

## 审批流程

```
draft -> pending_approval -> approved -> implementing -> completed -> archived
                         -> rejected -> draft (修改后重新提交)
```

审批记录存储在 `openspec/approvals/<change-id>.json`。

## CLI 选项

```bash
openspec-mcp [path] [options]

参数:
  path                    项目目录路径（默认：当前目录）

选项:
  --dashboard             仅启动 Web 仪表板（HTTP 模式）
  --with-dashboard        启动 MCP 服务器并同时启动仪表板
  -p, --port <number>     仪表板端口（默认：3000）
  -V, --version           显示版本号
  -h, --help              显示帮助
```

### 示例

```bash
# 仅 MCP 服务器（使用当前目录）
openspec-mcp

# MCP 服务器指定项目
openspec-mcp /path/to/project

# 仅仪表板
openspec-mcp --dashboard

# MCP 服务器 + 仪表板
openspec-mcp --with-dashboard

# 自定义端口启动仪表板
openspec-mcp --dashboard --port 8080
```

## Web 仪表板

仪表板提供可视化界面，用于管理变更、追踪任务和处理审批。

### 仪表板页面

| 路由 | 描述 |
|------|------|
| `/` | 概览统计和最近变更 |
| `/changes` | 变更列表及进度 |
| `/changes/:id` | 变更详情和任务管理 |
| `/specs` | 浏览规格文档 |
| `/approvals` | 审批队列管理 |

### 功能亮点

- **实时更新**: WebSocket 连接实现实时进度更新
- **任务管理**: 直接在 UI 中切换任务状态
- **审批操作**: 带备注的批准/拒绝操作
- **进度可视化**: 进度条和状态徽章

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 开发模式
npm run dev

# 运行测试
npm test
```

## 系统要求

- Node.js >= 20.0.0
- OpenSpec CLI (`npm install -g @fission-ai/openspec`)

## 许可证

MIT

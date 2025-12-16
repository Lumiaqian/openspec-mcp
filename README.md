# OpenSpec MCP

[![npm version](https://img.shields.io/npm/v/openspec-mcp)](https://www.npmjs.com/package/openspec-mcp)

MCP (Model Context Protocol) server for [OpenSpec](https://github.com/Fission-AI/OpenSpec) - spec-driven development with real-time dashboard and approval workflow.

## Features

- **MCP Tools**: Full OpenSpec CLI functionality exposed as MCP tools
- **Task Tracking**: Parse tasks.md and track progress in real-time
- **Approval Workflow**: Request, approve, and reject change proposals
- **Web Dashboard**: Visual management interface with real-time updates

## Quick Start

### 1. Add to your MCP configuration

**Claude Code CLI (recommended - uses current directory):**
```bash
claude mcp add openspec -- npx openspec-mcp
```

**Claude Code CLI with Dashboard:**
```bash
claude mcp add openspec -- npx openspec-mcp --with-dashboard
```

**Claude Code CLI with specific project path:**
```bash
claude mcp add openspec -- npx openspec-mcp /path/to/your/project
```

**Claude Desktop / Cursor / Other:**
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

**With Dashboard:**
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

### 2. Use in conversation

```
# List all changes
"List all openspec changes"

# Show change details
"Show me the add-user-auth change"

# Update task status
"Mark task 1.1 as done in add-user-auth"

# Request approval
"Request approval for add-user-auth from @reviewer"
```

## Available Tools

### Guides
| Tool | Description |
|------|-------------|
| `openspec_get_instructions` | Get AGENTS.md usage guide |
| `openspec_get_project_context` | Get project.md context |

### Management
| Tool | Description |
|------|-------------|
| `openspec_list_changes` | List all change proposals |
| `openspec_list_specs` | List all specifications |
| `openspec_show_change` | Show change details |
| `openspec_show_spec` | Show spec details |

### Validation
| Tool | Description |
|------|-------------|
| `openspec_validate_change` | Validate a change |
| `openspec_validate_spec` | Validate a spec |
| `openspec_validate_all` | Batch validation |

### Archive
| Tool | Description |
|------|-------------|
| `openspec_archive_change` | Archive completed change |

### Tasks
| Tool | Description |
|------|-------------|
| `openspec_get_tasks` | Get tasks and progress |
| `openspec_update_task` | Update task status |
| `openspec_get_progress_summary` | Get all changes progress |

### Approval
| Tool | Description |
|------|-------------|
| `openspec_get_approval_status` | Get approval status |
| `openspec_request_approval` | Request approval |
| `openspec_approve_change` | Approve a change |
| `openspec_reject_change` | Reject a change |
| `openspec_list_pending_approvals` | List pending approvals |

## Approval Workflow

```
draft -> pending_approval -> approved -> implementing -> completed -> archived
                         -> rejected -> draft (revise and resubmit)
```

Approval records are stored in `openspec/approvals/<change-id>.json`.

## CLI Options

```bash
openspec-mcp [path] [options]

Arguments:
  path                    Project directory path (default: current directory)

Options:
  --dashboard             Start web dashboard only (HTTP mode)
  --with-dashboard        Start MCP server with web dashboard
  -p, --port <number>     Dashboard port (default: 3000)
  -V, --version           Output version number
  -h, --help              Display help
```

### Examples

```bash
# MCP server only (uses current directory)
openspec-mcp

# MCP server with specific project
openspec-mcp /path/to/project

# Dashboard only
openspec-mcp --dashboard

# MCP server + Dashboard
openspec-mcp --with-dashboard

# Dashboard on custom port
openspec-mcp --dashboard --port 8080
```

## Web Dashboard

The dashboard provides a visual interface for managing changes, tracking tasks, and handling approvals.

### Dashboard Pages

| Route | Description |
|-------|-------------|
| `/` | Overview with stats and recent changes |
| `/changes` | List all changes with progress |
| `/changes/:id` | Change detail with task management |
| `/specs` | Browse specifications |
| `/approvals` | Approval queue management |

### Features

- **Real-time Updates**: WebSocket connection for live progress updates
- **Task Management**: Toggle task status directly from the UI
- **Approval Actions**: Approve/reject changes with comments
- **Progress Visualization**: Progress bars and status badges

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode
npm run dev

# Run tests
npm test
```

## Requirements

- Node.js >= 20.0.0
- OpenSpec CLI (`npm install -g @fission-ai/openspec`)

## License

MIT

# OpenSpec MCP

[![npm version](https://img.shields.io/npm/v/openspec-mcp)](https://www.npmjs.com/package/openspec-mcp)

MCP (Model Context Protocol) server for [OpenSpec](https://github.com/Fission-AI/OpenSpec) - spec-driven development with real-time dashboard and approval workflow.

## Features

- **MCP Tools**: Full OpenSpec CLI functionality exposed as MCP tools
- **Review System**: Add, reply, resolve review comments on proposals/designs
- **Task Tracking**: Parse tasks.md and track progress in real-time
- **Approval Workflow**: Request, approve, and reject change proposals
- **Cross-Service Docs**: View cross-service design documents from single service projects
- **Web Dashboard**: Visual management interface with real-time updates and Markdown rendering

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

## Available Prompts (New!)

Directly leverage your Client's AI capabilities (Claude, Codex) with context-aware prompts.

| Prompt            | Description                                     |
| ----------------- | ----------------------------------------------- |
| `analyze-project` | Deep analysis of project architecture and stack |
| `review-change`   | Intelligent review of changes with linked specs |

## Available Tools

### Guides & Context

| Tool                           | Description                       |
| ------------------------------ | --------------------------------- |
| `openspec_get_instructions`    | Get AGENTS.md usage guide         |
| `openspec_get_project_context` | Get project.md context            |
| `openspec_analyze_context`     | Analyze project structure & stack |
| `openspec_ai_analyze_context`  | AI-enhanced context analysis      |

### Management

| Tool                    | Description               |
| ----------------------- | ------------------------- |
| `openspec_list_changes` | List all change proposals |
| `openspec_list_specs`   | List all specifications   |
| `openspec_show_change`  | Show change details       |
| `openspec_show_spec`    | Show spec details         |

### Validation

| Tool                       | Description       |
| -------------------------- | ----------------- |
| `openspec_validate_change` | Validate a change |
| `openspec_validate_spec`   | Validate a spec   |
| `openspec_validate_all`    | Batch validation  |

### Archive

| Tool                      | Description              |
| ------------------------- | ------------------------ |
| `openspec_archive_change` | Archive completed change |

### Tasks

| Tool                            | Description              |
| ------------------------------- | ------------------------ |
| `openspec_get_tasks`            | Get tasks and progress   |
| `openspec_update_task`          | Update task status       |
| `openspec_batch_update_tasks`   | Batch update task status |
| `openspec_get_progress_summary` | Get all changes progress |

### Approval

| Tool                              | Description            |
| --------------------------------- | ---------------------- |
| `openspec_get_approval_status`    | Get approval status    |
| `openspec_request_approval`       | Request approval       |
| `openspec_approve_change`         | Approve a change       |
| `openspec_reject_change`          | Reject a change        |
| `openspec_list_pending_approvals` | List pending approvals |

### Reviews

| Tool                          | Description                                 |
| ----------------------------- | ------------------------------------------- |
| `openspec_add_review`         | Add review comment to proposal/design/tasks |
| `openspec_list_reviews`       | List reviews with filters                   |
| `openspec_reply_review`       | Reply to a review                           |
| `openspec_resolve_review`     | Mark review as resolved                     |
| `openspec_get_review_summary` | Get review statistics & blocking issues     |

### Templates

| Tool                        | Description                 |
| --------------------------- | --------------------------- |
| `openspec_list_templates`   | List available templates    |
| `openspec_create_change`    | Create change from template |
| `openspec_preview_template` | Preview template content    |

### Generator

| Tool                         | Description                         |
| ---------------------------- | ----------------------------------- |
| `openspec_generate_proposal` | Generate proposal from requirements |
| `openspec_save_proposal`     | Save generated proposal             |

### Hooks

| Tool                   | Description                 |
| ---------------------- | --------------------------- |
| `openspec_setup_hooks` | Setup git hooks for project |

### Cross-Service

| Tool                               | Description                   |
| ---------------------------------- | ----------------------------- |
| `openspec_list_cross_service_docs` | List cross-service documents  |
| `openspec_read_cross_service_doc`  | Read a cross-service document |

## Cross-Service Documentation

For multi-service projects sharing a common `.cross-service/` directory (e.g., in a Git worktree), configure your `proposal.md` frontmatter:

```yaml
---
crossService:
  rootPath: "../../../../.cross-service" # Relative to change directory
  documents:
    - design.md
    - flows.md
    - services.yaml
  archivePolicy: snapshot # 'snapshot' (default) or 'reference'
---
# Your proposal content...
```

The Dashboard will display a "Cross-Service" tab with:

- **design.md / flows.md**: Rendered as Markdown
- **services.yaml**: Visual card view with service status, changes, and deployment order

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
  -p, --port <number>     Dashboard port (default: 3000; auto-increments if busy, 0 for random)
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

| Route          | Description                            |
| -------------- | -------------------------------------- |
| `/`            | Overview with stats and recent changes |
| `/kanban`      | Drag-and-drop Kanban board             |
| `/changes`     | List all changes with progress         |
| `/changes/:id` | Change detail with Specs & Tasks       |
| `/qa`          | QA Runner dashboard                    |
| `/context`     | Project analysis & Tech stack          |
| `/specs`       | Browse specifications                  |
| `/approvals`   | Approval queue management              |

### Features

- **Real-time Updates**: WebSocket connection for live progress and review updates
- **Kanban Board**: 6-column workflow (Backlog -> Released) with drag-and-drop support
- **QA Dashboard**: Monitor and trigger quality checks directly from UI
- **Context Analysis**: Auto-detect tech stack and visualize directory structure
- **Task Management**: Toggle task status directly from the UI
- **Approval Actions**: Approve/reject changes with comments
- **Progress Visualization**: Progress bars and status badges
- **Review Management**: View, resolve and track reviews with Open/Resolved tabs
- **Cross-Service Docs**: View cross-service design documents with visual services.yaml display
- **Markdown Rendering**: Proposals and designs rendered with full Markdown support

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

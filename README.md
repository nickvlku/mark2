# mark2

AI Agent Orchestration System - Manage AI coding agents across your projects.

mark2 provides a dashboard and orchestration layer for running AI coding agents (like Claude) on your software projects. It manages task workflows, tracks progress, and coordinates multiple agents working on different tasks.

## Features

- **Task Management**: Create, track, and manage coding tasks with a visual dashboard
- **Phase Workflows**: Tasks progress through phases (design → coding → testing → review → done)
- **Agent Orchestration**: Automatically spawn and manage AI agents for each phase
- **Git Isolation**: Each task gets its own git clone for safe parallel development
- **Story Grouping**: Group related tasks into stories for better organization
- **MCP Integration**: Built-in MCP tools for agents to report progress and save artifacts

## Requirements

- **Node.js** 18+
- **npm** or **pnpm**
- **tmux** - for managing agent sessions
- **sqlite3** - for local database (usually pre-installed)
- **claude** CLI - for AI agents (optional, can use other AI CLIs)

### Installing Dependencies

**macOS:**
```bash
brew install tmux sqlite
```

**Arch Linux:**
```bash
sudo pacman -S tmux sqlite
```

**Debian/Ubuntu:**
```bash
sudo apt install tmux sqlite3
```

## Installation

### Option 1: NPM Global Install (Recommended)

```bash
npm install -g mark2
```

### Option 2: Clone and Install

```bash
git clone https://github.com/nickvlku/mark2.git
cd mark2
./install.sh
```

### Option 3: Development Setup

```bash
git clone https://github.com/nickvlku/mark2.git
cd mark2
pnpm install
pnpm build
pnpm mark2 --help
```

## Usage

### Initialize a Project

Navigate to your project directory and initialize mark2:

```bash
cd /path/to/your/project
mark2 init
```

This creates a `.mark2/` directory with:
- `config.yaml` - Project settings
- `context.json` - Project context for AI agents
- `tasks/` - Task YAML files
- `stories/` - Story YAML files
- `storage/` - Artifacts and session data

### Start the Dashboard

```bash
mark2 start
```

The dashboard opens at http://localhost:3100

### Create a Task

1. Open the dashboard
2. Click "New Task"
3. Enter title and description
4. Click "Start Design" to begin the workflow

### Working with External Projects

You can manage any project from anywhere using the `--project` flag:

```bash
# Initialize mark2 in a different directory
mark2 init /path/to/project

# Start server for a specific project
mark2 -p /path/to/project start

# Check status
mark2 --project=/path/to/project status
```

### CLI Commands

```
mark2 [OPTIONS] <COMMAND> [ARGS]

OPTIONS
  -h, --help              Show help message
  -v, --version           Show version number
  -p, --project <path>    Use the specified project directory

COMMANDS
  init [path]             Initialize Mark2 in a directory
  start                   Start the Mark2 server
  stop                    Stop the Mark2 server
  status                  Show active agent sessions
  reindex                 Rebuild the SQLite index from YAML files
  restart <taskId> [phase]  Restart current phase or transition
  kill-sessions           Kill all mark2 tmux sessions
  tmuxes                  Interactive tmux session selector
```

## Configuration

### config.yaml

```yaml
project_name: "my-project"
default_branch: main
target_branch: main
base_port: 4000
ports_per_task: 10
ide_commands:
  - cursor
  - code
  - zed
```

### context.json

Describe your project for AI agents:

```json
{
  "project_name": "my-project",
  "description": "A brief description of what your project does",
  "tech_stack": ["TypeScript", "React", "Node.js"],
  "testing_commands": {
    "unit": "npm test",
    "e2e": "npm run test:e2e"
  },
  "conventions": [
    "Use functional components",
    "Follow the existing code style"
  ]
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MARK2_DIR` | Override the .mark2 directory path | Auto-detected |
| `PORT` | Server port | 3100 |
| `MARK2_AGENT_TOKEN` | Token for agent authentication | mark2-local |

## Architecture

mark2 uses a YAML-first architecture:
- **YAML files** are the source of truth for tasks and stories
- **SQLite** provides fast indexing (rebuilt from YAML on startup)
- **Git clones** isolate each task's work
- **MCP tools** let agents interact with mark2

## License

MIT

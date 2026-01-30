# Mark2 Project Purpose

Mark2 is an agentic software development orchestrator. It's a Next.js-based web application that manages automated software development workflows through multiple phases.

## Core Capabilities:
- **Phase-based orchestration**: Manages software development tasks through predefined phases (pending, design, coding, testing, code_review, manual_testing, done)
- **Multi-agent support**: Supports different CLI adapters for various AI coding agents (Claude Code, Codex CLI, Gemini CLI, OpenCode)
- **TMUX session management**: Uses TMUX sessions to run agent processes and monitors them
- **End token detection**: Monitors agent output for specific tokens that trigger phase transitions
- **Task management**: Manages tasks with YAML files and SQLite database for tracking
- **Worktree integration**: Creates git worktrees for isolated development environments
- **Real-time monitoring**: WebSocket-based real-time updates and terminal streaming

## Architecture:
- Frontend: Next.js 16 with React 19, TypeScript, TailwindCSS
- Backend: Node.js with SQLite (better-sqlite3) and Drizzle ORM
- Orchestration: Custom engine with phase handlers
- Communication: WebSockets for real-time updates
- Testing: Vitest for unit tests, Playwright for E2E tests

## Key Components:
- Orchestration Engine (`src/lib/orchestration/engine.ts`)
- Phase Handlers (in `src/lib/orchestration/phase-handlers/`)
- CLI Adapters for different agents
- TMUX session management
- YAML-based configuration and task storage
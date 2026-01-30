# Mark2 Tech Stack

## Frontend
- **Framework**: Next.js 16.1.6 with App Router
- **UI Library**: React 19.2.3
- **Styling**: TailwindCSS 4
- **State Management**: SWR for data fetching, React hooks
- **Terminal**: xterm.js for terminal interface
- **Drag & Drop**: @dnd-kit for task board interactions
- **Markdown**: react-markdown with remark-gfm

## Backend
- **Runtime**: Node.js with TypeScript
- **Database**: SQLite with better-sqlite3
- **ORM**: Drizzle ORM 0.45.1
- **API**: Next.js API Routes
- **WebSockets**: ws library for real-time communication
- **Process Management**: TMUX for agent session management

## Development Tools
- **Language**: TypeScript 5 (strict mode)
- **Package Manager**: npm
- **Linting**: ESLint with Next.js configuration
- **Testing**: Vitest for unit tests, Playwright for E2E
- **Build Tool**: Next.js built-in (Turbo)
- **Process Runner**: tsx for TypeScript execution

## Agent Integration
- **MCP**: Model Context Protocol SDK for agent communication
- **CLI Adapters**: Support for Claude Code, Codex CLI, Gemini CLI, OpenCode
- **Orchestration**: Custom engine with end token detection

## Configuration & Data
- **Config Files**: YAML for configuration and task storage
- **Validation**: Zod schemas for type safety
- **UUID**: uuid library for ID generation
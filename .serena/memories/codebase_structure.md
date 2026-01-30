# Mark2 Codebase Structure

## Root Directory
- `src/` - All source code
- `cli/` - Command-line interface
- `public/` - Static assets for Next.js
- `tests/` - Test files
- `.mark2/` - Mark2 configuration and task storage
- `.worktrees/` - Git worktrees for isolated development

## Source Code Organization (`src/`)

### Core Libraries (`src/lib/`)
- `db/` - Database schema and connection
  - `schema.ts` - Drizzle ORM schema definitions
  - `index.ts` - Database utilities
  - `migrations/` - Database migrations
- `orchestration/` - Core orchestration engine
  - `engine.ts` - Main orchestration engine
  - `pipeline.ts` - Phase transition pipeline
  - `phase-handlers/` - Individual phase handlers
  - `end-token-watcher.ts` - Monitors agent output
  - `tmux-manager.ts` - TMUX session management
  - `prompt-assembler.ts` - Constructs agent prompts
- `adapters/` - CLI adapters for different agents
- `services/` - Business logic services
- `utils/` - Shared utilities
- `ws/` - WebSocket implementation
- `yaml/` - YAML file handling
- `mcp/` - Model Context Protocol integration

### Frontend (`src/app/`, `src/components/`)
- `app/` - Next.js App Router structure
  - `api/` - API routes
  - `page.tsx` - Main dashboard page
  - `layout.tsx` - Root layout
- `components/` - React components
  - `board/` - Kanban board components
  - `detail/` - Task detail views
  - `create/` - Task/story creation
  - `shared/` - Reusable components
  - `settings/` - Configuration UI

### Supporting Files
- `types/` - TypeScript type definitions
- `hooks/` - React custom hooks

## Configuration Files (`.mark2/`)
- `config.yaml` - Main configuration
- `agents.yaml` - Agent definitions
- `tasks/` - Individual task YAML files
- `stories/` - Story YAML files
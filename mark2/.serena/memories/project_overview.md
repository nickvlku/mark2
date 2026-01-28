# Mark2 Project Overview

## Purpose
Mark2 is an agentic software development orchestrator. It's a system that manages AI agents working on software development tasks through a structured workflow with phases like design, coding, testing, code review, and manual testing.

## Key Features
- **Task Management**: Manages tasks with different phases (pending, design, coding, testing, code_review, manual_testing, done)
- **Story Management**: Groups tasks into stories 
- **Agent Orchestration**: Coordinates different AI agents to work on tasks
- **Activity Tracking**: Logs all activities and phase changes
- **WebSocket Support**: Real-time updates through WebSocket connections
- **Artifact Management**: Handles task artifacts and outputs
- **Port Allocation**: Manages ports for services
- **Worktree Management**: Handles Git worktrees for parallel development

## Core Entities
- **Tasks**: Individual work items with phases, priorities, assignees
- **Stories**: Collections of related tasks
- **Agents**: AI agents that perform the work (claude-code, codex-cli, gemini-cli, opencode)
- **Artifacts**: Outputs from task phases (design documents, code, test results)
- **Activity Log**: Audit trail of all task activities

## Tech Stack
- **Frontend**: Next.js 16.1.6 with React 19.2.3
- **Backend**: Next.js API routes with WebSocket support
- **Database**: SQLite with Drizzle ORM for persistence
- **Data Format**: YAML for task/story definitions 
- **Testing**: Vitest for unit tests, Playwright for E2E tests
- **Language**: TypeScript with strict typing using Zod schemas
- **Styling**: TailwindCSS
- **CLI**: Node.js CLI for initialization and management
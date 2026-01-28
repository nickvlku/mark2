# Mark2 Coding Conventions

## Code Style
- **Language**: TypeScript with strict typing
- **Framework**: Next.js with App Router pattern
- **Linting**: ESLint with Next.js configuration
- **Formatting**: Standard Next.js formatting conventions

## File Structure
- `src/app/` - Next.js app router pages and API routes
- `src/components/` - React components
- `src/lib/` - Utility libraries and core business logic
- `src/types/` - TypeScript type definitions
- `src/hooks/` - React custom hooks
- `cli/` - Command-line interface implementation
- `tests/` - Test files (unit, integration, e2e)

## Naming Conventions
- **Files**: kebab-case for directories and files
- **Components**: PascalCase for React components
- **Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Types/Interfaces**: PascalCase

## Schema Validation
- All data structures defined using Zod schemas in `src/lib/yaml/schemas.ts`
- Schemas enforce data integrity and provide type safety
- ID patterns: `TASK-\\d+` for tasks, `STORY-\\d+` for stories

## API Design
- REST API endpoints in `src/app/api/`
- WebSocket support for real-time updates
- Consistent error handling and response formats

## Data Flow
- YAML files are source of truth for tasks/stories
- SQLite database for indexing and fast queries
- Use reindex command to sync YAML → SQLite
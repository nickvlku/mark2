# Mark2 Coding Style & Conventions

## TypeScript Configuration
- **Target**: ES2017
- **Strict mode**: Enabled
- **Module**: ESNext with bundler resolution
- **Path mapping**: `@/*` maps to `./src/*`
- **JSX**: react-jsx transformation

## ESLint Configuration
- Uses Next.js recommended configs (core-web-vitals + typescript)
- Global ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`

## Code Organization
- **Source structure**: All code in `src/` directory
- **API routes**: Following Next.js App Router pattern in `src/app/api/`
- **Components**: Organized by feature in `src/components/`
- **Types**: Centralized in `src/types/`
- **Utilities**: Shared utilities in `src/lib/`

## Naming Conventions
- **Files**: kebab-case for files (`task-service.ts`)
- **Components**: PascalCase for React components
- **Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Types**: PascalCase with descriptive names

## Import Patterns
- Use absolute imports with `@/` prefix for src files
- Type-only imports when importing only types
- Destructured imports for named exports

## Database & Schema
- Uses Drizzle ORM with SQLite
- Schema definitions in `src/lib/db/schema.ts`
- Database utilities in `src/lib/db/index.ts`

## Error Handling
- Uses Result patterns for file operations
- Proper error logging in orchestration engine
- Graceful degradation for non-critical operations
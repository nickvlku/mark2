# Code Style and Conventions

## TypeScript Configuration
- Target ES2017 with strict mode enabled
- Path mapping with `@/` for src directory
- Incremental compilation enabled
- React JSX transform

## Code Style
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Files**: kebab-case for file names, .tsx for React components
- **Imports**: Use `@/` alias for internal imports
- **Types**: Exported from schema files with Zod validation

## ESLint Rules
- Uses Next.js recommended rules for both core-web-vitals and TypeScript
- Ignores build directories (.next, out, build)
- Follows standard React/Next.js conventions

## Database Patterns
- Drizzle ORM with SQLite backend
- Schema definitions in `src/lib/db/schema.ts`
- Type-safe queries with Drizzle query builder

## API Patterns
- Next.js App Router API routes in `src/app/api/`
- RESTful endpoint design
- Zod validation for request/response schemas
- Error handling with proper HTTP status codes

## Component Structure
- Shared components in `src/components/shared/`
- Feature-specific components in dedicated folders
- Props interfaces defined inline or in types file
- Use TypeScript for all components
# Mark2 Suggested Commands

## Development Commands
```bash
# Start development server (Next.js)
npm run dev:next

# Start Mark2 server with orchestration engine
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Testing Commands
```bash
# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run E2E tests with Playwright
npm run test:e2e
```

## Code Quality Commands
```bash
# Run ESLint
npm run lint

# Type check
npx tsc --noEmit
```

## Mark2 CLI Commands
```bash
# Initialize Mark2 in project
npm run mark2 init

# Start Mark2 server
npm run mark2 start

# Reindex database from YAML files
npm run mark2 reindex

# Show active agent sessions
npm run mark2 status
```

## Database Commands
```bash
# Run Drizzle migrations
npx drizzle-kit migrate

# Generate new migration
npx drizzle-kit generate

# Open Drizzle Studio
npx drizzle-kit studio
```

## System Commands (Linux)
Standard Linux commands are available:
- `git` for version control
- `ls`, `cd`, `pwd` for file navigation  
- `grep`, `find` for searching
- `tmux` for session management (used internally by Mark2)
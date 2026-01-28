# Mark2 Task Completion Workflow

## When a coding task is completed, follow these steps:

### 1. Code Quality Checks
```bash
# Run linting
npm run lint

# Check TypeScript compilation
npx tsc --noEmit
```

### 2. Testing
```bash
# Run unit tests
npm run test

# Run E2E tests if applicable
npm run test:e2e
```

### 3. Build Verification
```bash
# Ensure project builds successfully
npm run build
```

### 4. Database Migration (if schema changes)
```bash
# Generate migration if database schema changed
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate
```

### 5. Git Operations
```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "descriptive commit message"

# Push to remote if needed
git push
```

### 6. Mark2 Specific
- Ensure any new phase handlers emit appropriate end tokens
- Update configuration files if new agents or phases added
- Test orchestration flow if changes affect the engine
- Reindex if task/story structure changed: `npm run mark2 reindex`

## End Tokens for Phase Transitions
When implementing phase handlers, ensure they emit correct end tokens:
- `[DESIGN_COMPLETED]` - Design phase completion
- `[CODING_COMPLETED]` - Coding phase completion  
- `[TESTING_PASSED]` / `[TESTING_FAILED]` - Testing results
- `[REVIEW_COMPLETED]` - Code review completion
- `[MANUAL_TESTING_COMPLETED]` - Manual testing completion
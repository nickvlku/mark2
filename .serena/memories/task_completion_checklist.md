# Task Completion Checklist for Mark2

When completing a task in Mark2, follow this checklist:

## Code Quality
- [ ] Run `npm run lint` and fix any linting errors
- [ ] Ensure TypeScript types are correct (no `any` types)
- [ ] Follow existing code conventions and patterns
- [ ] Add proper error handling where needed

## Testing
- [ ] Run `npm test` to ensure all unit tests pass
- [ ] Run `npm run test:e2e` to ensure E2E tests pass  
- [ ] Add new tests for any new functionality
- [ ] Update existing tests if behavior changed

## Schema Validation
- [ ] Update Zod schemas if data structures changed
- [ ] Ensure YAML structure remains valid
- [ ] Test YAML ↔ SQLite synchronization if schemas changed

## Documentation
- [ ] Update inline code comments for complex logic
- [ ] Update API documentation if endpoints changed
- [ ] Ensure README stays current for major changes

## Data Integrity  
- [ ] Run `npm run mark2 reindex` if YAML structure changed
- [ ] Verify data migrations work correctly
- [ ] Test with sample data to ensure no corruption

## Integration
- [ ] Test WebSocket functionality if modified
- [ ] Verify CLI commands still work correctly
- [ ] Test with different agent types if orchestration changed

## Final Verification
- [ ] Build passes: `npm run build`
- [ ] Server starts without errors: `npm run dev`
- [ ] Basic functionality works in browser
- [ ] No console errors in browser dev tools
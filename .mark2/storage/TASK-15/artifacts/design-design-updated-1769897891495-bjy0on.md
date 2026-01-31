# Design Document: Update Claude Model Versions to 4.5 (Updated)

## Overview

This task addresses updating the Claude model version references in the Mark2 codebase from Claude 4.0 to Claude 4.5, using the correct model aliases for the latest versions.

## Current State Analysis

### Model Configuration
The models are currently defined in `src/lib/constants/models.ts` as:
```typescript
'claude-code': [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
],
```

**These are Claude 4.0 model IDs**, not the 4.5 versions.

### Correct Claude 4.5 Model IDs

Based on research and user confirmation:
- **Claude Sonnet 4.5**: 
  - Full ID: `claude-sonnet-4-5-20250929`
  - Recommended alias: `claude-sonnet-4-5`
- **Claude Opus 4.5**: 
  - Full ID: `claude-opus-4-5-20251101`
  - Recommended alias: `claude-opus-4-5`

## Design Decision

### Approach
1. Update model IDs to use the 4.5 aliases (`claude-sonnet-4-5` and `claude-opus-4-5`)
2. Update display names to show "4.5" explicitly
3. Update all references throughout the codebase

### Rationale for Using Aliases
- **Future-proofing**: Aliases automatically point to the latest stable version
- **Simplicity**: Shorter and cleaner than full timestamped IDs
- **Best practice**: Anthropic recommends using aliases for non-production use cases
- **Consistency**: Both models use the same naming pattern

## Technical Implementation

### Files to Update

1. **`src/lib/constants/models.ts`**:
   ```typescript
   'claude-code': [
     { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
     { id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
   ],
   ```

2. **`src/lib/constants/default-agents.ts`**:
   - Update all instances of `claude-sonnet-4-20250514` to `claude-sonnet-4-5`
   - Update all instances of `claude-opus-4-20250514` to `claude-opus-4-5`

3. **`cli/templates/agents.yaml`**:
   - Update all model references from `claude-sonnet-4-20250514` to `claude-sonnet-4-5`

4. **Test files**:
   - Update all test files that reference the old model IDs
   - Files include:
     - `tests/unit/services/config-service-agents.test.ts`
     - `tests/unit/schemas/agent-schemas.test.ts`
     - `tests/integration/api/agents.test.ts`
     - Any other test files with model references

5. **Existing agent configurations**:
   - Consider migration strategy for existing `.mark2/agents.yaml` files
   - Could provide a migration script or handle transparently

## Migration Considerations

### Backward Compatibility
- Existing agents using old model IDs will need migration
- Options:
  1. **Automatic migration**: Map old IDs to new ones at runtime
  2. **Migration script**: Provide a tool to update existing configurations
  3. **Deprecation warning**: Show warnings for old model IDs

### Recommended Approach
Implement automatic migration with deprecation warnings:
```typescript
// Model migration map
const MODEL_MIGRATIONS: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-sonnet-4-5',
  'claude-opus-4-20250514': 'claude-opus-4-5',
};
```

## Benefits of Upgrade

Based on the research, Claude 4.5 models offer:
- **Better performance**: Especially for coding tasks
- **Lower cost**: Opus 4.5 is significantly cheaper than Opus 4.0
- **Improved capabilities**: Enhanced reasoning and code generation
- **Latest features**: Access to new capabilities like extended thinking

## Testing Plan

1. **Unit Tests**:
   - Update model validation tests
   - Add migration tests
   - Verify backward compatibility

2. **Integration Tests**:
   - Test agent creation with new models
   - Verify existing agents still function
   - Test migration scenarios

3. **Manual Testing**:
   - Create new agents with 4.5 models
   - Run tasks with updated agents
   - Verify UI displays correct model names

## Implementation Steps

1. Update model definitions in `src/lib/constants/models.ts`
2. Create migration mapping for backward compatibility
3. Update all model references in default agents
4. Update CLI templates
5. Update test files
6. Add migration logic to agent loading
7. Test thoroughly
8. Document the upgrade in release notes

## Risk Mitigation

1. **Breaking Changes**: Use migration mapping to prevent breaking existing setups
2. **API Compatibility**: Verify Claude Code CLI supports the new model IDs
3. **Cost Changes**: Document any pricing differences for users
4. **Performance**: Monitor for any performance differences with new models

## Future Considerations

1. **Model Versioning**: Implement a more robust model version management system
2. **Dynamic Loading**: Consider loading available models from Claude Code API
3. **Model Capabilities**: Add metadata about model capabilities and pricing
4. **Deprecation Policy**: Establish clear deprecation timeline for old models

## Sources
- [Claude API Docs - Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Claude Sonnet 4.5 - OpenRouter](https://openrouter.ai/anthropic/claude-sonnet-4.5)
- [Claude Opus 4.5 - OpenRouter](https://openrouter.ai/anthropic/claude-opus-4.5)
- [Claude 4.5 API Pricing Guide](https://www.cometapi.com/the-guide-to-claude-opus-4--4-5-api-pricing-in-2026/)
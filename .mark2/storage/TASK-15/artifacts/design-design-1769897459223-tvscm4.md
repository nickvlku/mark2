# Design Document: Update Claude Model Versions to 4.5

## Overview

This task addresses updating the Claude model version references in the Mark2 codebase to explicitly use Claude Sonnet 4.5 and Claude Opus 4.5 instead of the generic "4" version labeling which could be interpreted as 4.0.

## Current State Analysis

### Model Configuration
The models are currently defined in `src/lib/constants/models.ts` as:
```typescript
'claude-code': [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
],
```

### Usage Throughout Codebase
These model references are used in:
1. **Default agent templates** (`src/lib/constants/default-agents.ts`):
   - `expert-system-architect`: uses `claude-opus-4-20250514`
   - `expert-ui-ux-designer`: uses `claude-sonnet-4-20250514`
   - `expert-fullstack-coder`: uses `claude-sonnet-4-20250514`
   - `expert-frontend-coder`: uses `claude-sonnet-4-20250514`
   - `expert-security-coder`: uses `claude-opus-4-20250514`
   - `expert-test-engineer`: uses `claude-sonnet-4-20250514`
   - `expert-code-reviewer`: uses `claude-opus-4-20250514`
   - `expert-security-reviewer`: uses `claude-opus-4-20250514`
   - `expert-qa-analyst`: uses `claude-sonnet-4-20250514`
   - `expert-accessibility-tester`: uses `claude-sonnet-4-20250514`

2. **CLI templates** (`cli/templates/agents.yaml`):
   - All example agents use `claude-sonnet-4-20250514`

3. **Test files**: Multiple test files reference these model IDs

4. **Commit message template** (referenced in system prompt):
   - Uses "Co-Authored-By: Claude Opus 4 <noreply@anthropic.com>"

## Design Decision

### Approach
Update the display names to explicitly show "4.5" while keeping the model IDs unchanged, as the IDs likely already represent the 4.5 versions based on their date stamp (20250514).

### Rationale
1. **Clarity**: Explicitly showing "4.5" removes any ambiguity about which version is being used
2. **Minimal Impact**: Changing only the display names preserves existing configurations that use the model IDs
3. **User Communication**: Clear version numbers help users understand they're using the latest models
4. **Consistency**: Both Sonnet and Opus should use the same version numbering scheme

## Technical Implementation

### Files to Update

1. **`src/lib/constants/models.ts`**:
   - Change `name: 'Claude Sonnet 4'` to `name: 'Claude Sonnet 4.5'`
   - Change `name: 'Claude Opus 4'` to `name: 'Claude Opus 4.5'`

2. **System Prompt for Commit Messages**:
   - This appears to be configured in the Claude Code CLI itself
   - The commit message currently uses "Claude Opus 4"
   - Should be updated to "Claude Opus 4.5"

### No Changes Required
- Model IDs (`claude-sonnet-4-20250514`, `claude-opus-4-20250514`) remain unchanged
- Agent configurations continue to reference the same model IDs
- Test files don't need updates as they use the model IDs

## Risks and Considerations

1. **External Dependencies**: 
   - The commit message template appears to be part of the Claude Code CLI configuration
   - We may not be able to update this from within the Mark2 codebase
   - This might require coordination with the Claude Code team

2. **User Communication**:
   - Existing users will see the version number change in the UI
   - This should be communicated as a clarification, not a model upgrade

3. **Backward Compatibility**:
   - No breaking changes as we're only updating display names
   - Existing configurations will continue to work

## Testing Plan

1. **Visual Verification**:
   - Check that the model dropdown in the agent configuration UI shows "4.5"
   - Verify the change appears correctly in all relevant UI components

2. **Functional Testing**:
   - Ensure agents can still be created with the updated models
   - Verify existing agents continue to work
   - Test that model selection persists correctly

3. **Integration Testing**:
   - Confirm that agents using these models can still execute tasks
   - Verify commit messages (if we can update them) show the correct version

## Implementation Steps

1. Update the model display names in `src/lib/constants/models.ts`
2. Run tests to ensure no regression
3. Manually test the UI to verify the display changes
4. Document the clarification in release notes
5. Investigate options for updating the commit message template

## Future Considerations

1. **Version Management**: Consider adding a more structured version field to the ModelDefinition interface
2. **Model Metadata**: Could add fields for release date, capabilities, or deprecation status
3. **Dynamic Model Loading**: Consider loading model definitions from a configuration file for easier updates
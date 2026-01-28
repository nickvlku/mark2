# Agent Creation Page Design Document

## Task Overview

**Task ID:** TASK-3  
**Title:** Agent Creation Page  
**Description:** Create an agent page that lets you edit/create agents and create a top nav that links to both "Board" and "Agent"

## Current State Analysis

After thorough analysis of the existing codebase, I've discovered that **the agent management functionality is already fully implemented**:

### ✅ Already Implemented Features

1. **Agent Page Route**: `/agents` route exists at `src/app/agents/page.tsx`
2. **Full CRUD Operations**: Complete agent management with create, read, update, delete functionality
3. **AgentsPage Component**: `src/components/agents/AgentsPage.tsx` provides full agent management UI
4. **Create/Edit Dialogs**: 
   - `src/components/agents/CreateAgentDialog.tsx` - Agent creation with validation
   - `src/components/agents/EditAgentDialog.tsx` - Agent editing functionality
5. **Data Models**: Complete agent schemas in `src/lib/yaml/schemas.ts`
6. **API Endpoints**: REST API at `/api/agents` with GET/PUT operations
7. **Data Hook**: `src/hooks/useAgents.ts` for data fetching with SWR
8. **Partial Navigation**: Board page has link to Agents page

### ❌ Missing Requirement

The only missing piece is **consistent top navigation** - the AgentsPage only has a back button instead of proper navigation between Board and Agents.

## Architecture Design

### Navigation Component Architecture

The design will implement a shared navigation component that can be used across both pages:

```
src/components/shared/TopNavigation.tsx
├── Home/Board link
├── Agents link  
└── Current page indicator
```

### Component Integration Strategy

Rather than duplicate navigation logic in each page, we'll:

1. Create a reusable `TopNavigation` component
2. Update both Board and Agents pages to use consistent navigation
3. Maintain the existing page-specific action buttons

## Data Models (Already Complete)

The agent data model is already well-designed:

```typescript
interface AgentDefinition {
  name: string;                    // Lowercase alphanumeric with hyphens
  cli_tool: 'claude-code' | 'codex-cli' | 'gemini-cli' | 'opencode';
  model: string;                   // Model identifier
  role_prompt: string;             // Agent's role description
  timeout_minutes: number;         // Default 60 minutes
}
```

**Validation Rules:**
- Name: Must be lowercase alphanumeric with hyphens, starting with letter
- All fields required except timeout_minutes (defaults to 60)
- Name uniqueness enforced
- Zod schema validation throughout

## API Contracts (Already Complete)

### Existing Agent API

**GET /api/agents**
- Returns: `{ agents: AgentDefinition[] }`
- Used for fetching all agents

**PUT /api/agents**  
- Body: `{ agents: AgentDefinition[] }`
- Returns: `{ agents: AgentDefinition[] }`
- Replaces entire agent list (atomic operation)
- Includes validation with Zod schemas

The API design is solid and requires no changes.

## User Experience Design

### Current UX Assessment

**Board Page Navigation:**
- ✅ Has "Agents" link in header nav
- ✅ Clear page title "Mark2 Board"
- ✅ Consistent with design system

**Agents Page Navigation:**
- ❌ Only has "Back to Board" link
- ❌ Inconsistent navigation pattern
- ✅ Good CRUD functionality

### Improved Navigation UX

The new navigation will provide:

1. **Consistent Navigation Bar** across both pages
2. **Clear Active State** showing current page
3. **Breadcrumb-style Navigation** for better user orientation
4. **Preserved Page Actions** (create buttons, filters)

## File Changes Required

### New Files

1. **`src/components/shared/TopNavigation.tsx`**
   - Shared navigation component
   - Active page highlighting
   - Consistent styling with design system

### Modified Files

1. **`src/components/agents/AgentsPage.tsx`**
   - Replace back button with TopNavigation component
   - Maintain existing CRUD functionality
   - Keep page-specific "Create Agent" button

2. **`src/components/board/Board.tsx`**
   - Replace inline navigation with TopNavigation component
   - Maintain existing filters and action buttons
   - Keep current functionality intact

## Implementation Plan

### Phase 1: Create Shared Navigation Component
```typescript
// src/components/shared/TopNavigation.tsx
interface TopNavigationProps {
  currentPage: 'board' | 'agents';
}

export function TopNavigation({ currentPage }: TopNavigationProps) {
  // Navigation links with active states
  // Consistent styling with existing design
}
```

### Phase 2: Update Board Page
- Replace inline navigation with TopNavigation
- Pass `currentPage="board"`
- Maintain existing StoryFilter and action buttons

### Phase 3: Update Agents Page  
- Replace back button with TopNavigation
- Pass `currentPage="agents"`
- Keep existing "Create Agent" button

### Phase 4: Testing
- Verify navigation works correctly
- Ensure all existing functionality preserved
- Test responsive behavior

## Design System Consistency

### Colors & Styling
Following existing design tokens from the codebase:

```css
/* Navigation Links */
.nav-link {
  @apply text-sm text-text-secondary hover:text-text-primary transition-colors;
}

.nav-link-active {
  @apply text-text-primary font-medium;
}

/* Navigation Container */
.top-nav {
  @apply flex items-center gap-4;
}
```

### Typography
- Use existing font scales and weights
- Match current header typography patterns
- Maintain accessibility with proper contrast

## Risk Assessment & Edge Cases

### Low Risk Items
1. **Existing Functionality Preservation**: All current features remain untouched
2. **Data Model Stability**: No changes to agent schemas or API contracts
3. **Component Isolation**: TopNavigation is self-contained

### Potential Issues & Mitigations

1. **Navigation State Management**
   - **Risk**: Navigation might not reflect current page correctly
   - **Mitigation**: Use Next.js router pathname for accurate active states

2. **Responsive Design**
   - **Risk**: Navigation might break on smaller screens
   - **Mitigation**: Follow existing responsive patterns in Board component

3. **Design Consistency**
   - **Risk**: New navigation might not match existing design
   - **Mitigation**: Use exact color tokens and spacing from existing components

4. **Performance Impact**
   - **Risk**: Adding navigation component could affect page load
   - **Mitigation**: Navigation is simple and follows existing patterns

## Testing Strategy

### Manual Testing Checklist
- [ ] Navigation links work correctly between pages
- [ ] Active page highlighting functions properly  
- [ ] All existing Board functionality preserved
- [ ] All existing Agents CRUD operations work
- [ ] Responsive design maintains usability
- [ ] Accessibility with keyboard navigation

### Regression Testing
- [ ] Agent creation still works
- [ ] Agent editing still works  
- [ ] Agent deletion still works
- [ ] Board filters still work
- [ ] Task creation still works
- [ ] Story creation still works

## Future Considerations

### Potential Enhancements
1. **Breadcrumb Navigation**: For deeper navigation hierarchies
2. **Quick Actions**: Global actions accessible from navigation
3. **User Profile**: User management integration
4. **Settings Access**: Quick access to configuration

### Scalability
The TopNavigation component is designed to be easily extended with additional navigation items as the application grows.

## Conclusion

This design addresses the task requirements while leveraging the substantial existing implementation. The agent page functionality is already complete and well-architected. The primary work involves creating a consistent navigation experience between the Board and Agents pages.

**Key Benefits:**
- ✅ Completes task requirements with minimal changes
- ✅ Improves user experience with consistent navigation
- ✅ Preserves all existing functionality
- ✅ Follows established design patterns
- ✅ Low implementation risk

**Deliverables:**
1. Shared TopNavigation component
2. Updated Board page with consistent navigation
3. Updated Agents page with proper navigation
4. Comprehensive testing of navigation flows

The implementation maintains the high quality of the existing codebase while providing the requested navigation improvements.
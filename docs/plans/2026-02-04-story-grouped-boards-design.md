# Story-Grouped Boards Design

## Overview

Restructure the board to optionally group tasks under their respective stories, with collapsible sections and a dedicated story sidebar.

## Requirements

1. **Toggle between flat and grouped views** - User can switch between current flat board and story-grouped view
2. **Story-grouped view** - Tasks grouped by story, each story has its own horizontal kanban board
3. **Unassigned section** - Tasks without a story appear in "Unassigned" section at top
4. **Collapsible sections** - All sections (unassigned + each story) can be collapsed/expanded
5. **Story sidebar** - Left-side panel showing story details, can coexist with task sidebar on right
6. **Story pill on cards** - In flat view, show story badge on cards (like ownership pill)
7. **MCP commands** - `add_to_story` and `add_task_blocker` commands for agents

## Data Model & State

### New state in Board.tsx

```typescript
const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
const [selectedStoryForSidebar, setSelectedStoryForSidebar] = useState<string | null>(null);
```

### Grouping logic

- When `viewMode === 'grouped'`, tasks are grouped by `story_id`
- Tasks with `story_id === null` go into "Unassigned" pseudo-section (key: `__unassigned__`)
- Stories sorted by ID (STORY-1, STORY-2, etc.), unassigned always first
- Progress: `tasks.filter(t => t.story_id === storyId && t.phase === 'done').length` / total

### Persistence

- `viewMode` persisted to localStorage
- `collapsedSections` not persisted (resets on page load)

## Components

### StorySection.tsx

Container for a story's board.

```
Props: story (Story | null for unassigned), tasks (Task[]), isCollapsed,
       onToggleCollapse, onStoryClick, onCardClick, onArchive, etc.

Structure:
├── StorySectionHeader
│   ├── Collapse chevron icon (rotates when collapsed)
│   ├── Story ID badge ("STORY-1" or "Unassigned")
│   ├── Title (truncated, ~40 chars)
│   └── Progress badge "(2/5 done)"
│
└── Collapsible board area (hidden when collapsed)
    └── Horizontal scrolling div with phase columns
        └── Reuses existing Column component
```

### StorySidebar.tsx

Left-side panel for story details.

```
Props: story (Story), onClose, onTaskClick, onUpdate

Structure:
├── Header with story ID + close button
├── Tab bar: Overview | Tasks | Artifacts
├── Tab content:
│   ├── Overview: title (editable), description (editable), progress bar, created_at
│   ├── Tasks: list of task IDs as clickable links with status
│   └── Artifacts: list of artifacts linked to this story
```

### ViewModeToggle.tsx

Simple toggle in header.

```
Props: mode ('flat' | 'grouped'), onChange

Visual: Segmented control labeled "Flat" / "By Story"
```

### Card.tsx modification

Add story pill in flat view when `task.story_id` exists.

## Layout

### Flat view (existing + story pill)

```
┌─────────────────────────────────────────────────────────┐
│ Board                    [Flat|By Story] [Archive] [+]  │
├─────────────────────────────────────────────────────────┤
│ pending │ design │ coding │ testing │ ... │ done        │
│ ┌─────┐ │        │        │         │     │             │
│ │TASK │ │        │        │         │     │             │
│ │[S-1]│ │  (story pill shown on cards)    │             │
│ └─────┘ │        │        │         │     │             │
└─────────────────────────────────────────────────────────┘
```

### Grouped view

```
┌─────────────────────────────────────────────────────────┐
│ Board                    [Flat|By Story] [Archive] [+]  │
├─────────────────────────────────────────────────────────┤
│ ▼ Unassigned (1/3 done)                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ pending │ design │ coding │ ... │ done (scrollable) │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ▼ STORY-1: Implement auth flow (2/5 done)              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ pending │ design │ coding │ ... │ done (scrollable) │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ▶ STORY-2: Dashboard redesign (0/3 done)  [collapsed]  │
└─────────────────────────────────────────────────────────┘
```

### Story Sidebar (left side)

```
┌────────────────────────────────────┐
│ STORY-1                        [X] │
├────────────────────────────────────┤
│ [Overview] [Tasks] [Artifacts]     │
├────────────────────────────────────┤
│ Title                        [edit]│
│ Implement user authentication      │
│                                    │
│ Description                  [edit]│
│ Add login, signup, password reset  │
│ flows with OAuth support...        │
│                                    │
│ Progress                           │
│ ████████░░░░░░░░ 2/5 tasks done    │
│                                    │
│ Created                            │
│ 2024-01-15                         │
└────────────────────────────────────┘
```

## MCP Commands

### mark2_add_to_story

```typescript
{
  name: 'mark2_add_to_story',
  description: 'Assign or move a task to a story. Pass null for story_id to unassign.',
  inputSchema: {
    task_id: { type: 'string', required: true },
    story_id: { type: 'string', nullable: true, required: true }
  }
}
```

Behavior:
1. Validate task exists
2. Validate story exists (if story_id not null)
3. Update task.story_id
4. Return success with updated task

### mark2_add_task_blocker

```typescript
{
  name: 'mark2_add_task_blocker',
  description: 'Add a blocker to a task. Idempotent - no error if already blocked.',
  inputSchema: {
    task_id: { type: 'string', required: true },
    blocker_id: { type: 'string', required: true }
  }
}
```

Behavior:
1. Validate both tasks exist
2. Check for circular dependency
3. Append to blockers array if not already present
4. Return success with updated task

## Implementation Order

1. Add MCP commands (independent, testable via CLI)
2. Add story pill to Card in flat view
3. Create ViewModeToggle component
4. Create StorySectionHeader component
5. Create StorySection component
6. Create StorySidebar component
7. Wire everything together in Board.tsx
8. Add localStorage persistence for viewMode
9. Add/verify PUT endpoint for story editing

## Files

### New files
- `src/components/board/StorySection.tsx`
- `src/components/board/StorySectionHeader.tsx`
- `src/components/board/ViewModeToggle.tsx`
- `src/components/detail/StorySidebar.tsx`

### Modified files
- `src/components/board/Board.tsx`
- `src/components/board/Card.tsx`
- `src/components/board/CardBadges.tsx`
- `src/lib/mcp/server.ts`
- `src/app/api/stories/[id]/route.ts`

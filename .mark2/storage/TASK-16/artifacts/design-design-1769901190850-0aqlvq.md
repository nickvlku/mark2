# Design: Board Pan/Drag and Arrow Key Navigation

## Overview

The board displays 9 phase columns (pending → done), each 280-320px wide, resulting in a total width of ~2500-2900px. This doesn't fit on typical screens (1440-1920px), making horizontal navigation essential for usability.

**Current state**: The board uses `overflow-x-auto` with native scrollbars, which works but isn't intuitive or discoverable.

**Goal**: Add intuitive pan/drag functionality and keyboard navigation (arrow keys) to improve board usability.

---

## Requirements

1. **Drag-to-Pan**: Click and drag on empty space to pan the board horizontally
2. **Arrow Key Navigation**: Left/Right arrow keys scroll by one column
3. **Non-Conflicting**: Must coexist with existing card drag-and-drop
4. **Accessible**: Keyboard navigation should work without mouse
5. **Responsive**: Support both mouse and touch interactions

---

## Technical Analysis

### Current Architecture

```
Board.tsx
├── DndContext (from @dnd-kit/core)
│   └── PointerSensor (activationConstraint: { distance: 8 })
│       ├── Column (useDroppable) × 9
│       │   └── Card (useDraggable) × N
│       └── DragOverlay
└── TaskDetail (slide-over)
```

**Key constraint**: dnd-kit's `PointerSensor` captures pointer events on draggable elements. We need to distinguish between:
- Clicks/drags on **Cards** → dnd-kit handles for task drag-and-drop
- Clicks/drags on **Empty space** → Our code handles for panning

### Conflict Resolution Strategy

The `PointerSensor` uses `distance: 8` as activation constraint—the user must drag 8px before drag activates. We can use a similar approach:

1. On `pointerdown`, check if target is inside a draggable card
2. If **not** on a card, track the pointer for pan mode
3. If pointer moves, scroll the container by the delta
4. On `pointerup`, stop tracking

This approach avoids conflicts because:
- Cards have their own event handlers via dnd-kit's `useDraggable`
- We only activate pan when clicking on empty space (columns, gaps, backgrounds)

---

## Design Solution

### 1. New Hook: `useBoardPan`

Create a reusable hook that provides pan and keyboard navigation for the board container.

```typescript
// src/hooks/useBoardPan.ts

interface UseBoardPanOptions {
  /** Ref to the scrollable container */
  containerRef: RefObject<HTMLElement>;
  /** Selector for elements that should NOT trigger pan (e.g., draggable cards) */
  ignoreSelector?: string;
  /** Scroll amount per arrow key press (default: 320 - one column) */
  scrollAmount?: number;
  /** Enable keyboard navigation (default: true) */
  enableKeyboard?: boolean;
}

interface UseBoardPanReturn {
  /** Whether currently panning */
  isPanning: boolean;
  /** Event handlers to spread on the container */
  panHandlers: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerLeave: (e: PointerEvent) => void;
  };
}
```

**Implementation details**:

```typescript
export function useBoardPan({
  containerRef,
  ignoreSelector = '[data-draggable="true"]',
  scrollAmount = 320,
  enableKeyboard = true,
}: UseBoardPanOptions): UseBoardPanReturn {
  const [isPanning, setIsPanning] = useState(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const isPointerDown = useRef(false);

  // Pan handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Ignore if clicking on a draggable card
    const target = e.target as HTMLElement;
    if (target.closest(ignoreSelector)) return;
    
    // Ignore if not left mouse button or primary touch
    if (e.button !== 0) return;
    
    const container = containerRef.current;
    if (!container) return;

    isPointerDown.current = true;
    startX.current = e.clientX;
    scrollLeft.current = container.scrollLeft;
    
    // Capture pointer for smooth tracking
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [containerRef, ignoreSelector]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPointerDown.current) return;
    
    const container = containerRef.current;
    if (!container) return;

    const deltaX = e.clientX - startX.current;
    
    // Only enter pan mode if moved more than 5px (to distinguish from clicks)
    if (Math.abs(deltaX) > 5 && !isPanning) {
      setIsPanning(true);
    }

    if (isPanning || Math.abs(deltaX) > 5) {
      container.scrollLeft = scrollLeft.current - deltaX;
    }
  }, [containerRef, isPanning]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isPointerDown.current = false;
    setIsPanning(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!enableKeyboard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or dialog is open
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || 
          target.isContentEditable || target.closest('[role="dialog"]')) {
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, scrollAmount, enableKeyboard]);

  return {
    isPanning,
    panHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerUp,
    },
  };
}
```

### 2. Modifications to Board.tsx

**Changes required**:

1. Add a ref to the scrollable container
2. Import and use the `useBoardPan` hook
3. Add `data-draggable="true"` to Card components to mark them as draggable
4. Apply pan handlers and cursor styles

```tsx
// Board.tsx changes

import { useBoardPan } from '@/hooks/useBoardPan';

export function Board() {
  // ... existing state ...
  
  const boardContainerRef = useRef<HTMLDivElement>(null);
  
  const { isPanning, panHandlers } = useBoardPan({
    containerRef: boardContainerRef,
    ignoreSelector: '[data-draggable="true"]',
    scrollAmount: 320,
  });

  return (
    <div className="flex h-screen flex-col">
      {/* ... header ... */}
      
      {/* Board Columns - with pan support */}
      <div
        ref={boardContainerRef}
        {...panHandlers}
        className={`flex flex-1 gap-3 overflow-x-auto px-4 py-4 ${
          isPanning ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
      >
        <DndContext ...>
          {/* columns */}
        </DndContext>
      </div>
    </div>
  );
}
```

### 3. Modifications to Card.tsx

Add the `data-draggable` attribute to identify draggable elements:

```tsx
// Card.tsx - add data attribute

<div
  ref={setNodeRef}
  data-draggable="true"  // <-- Add this
  style={style}
  {...listeners}
  {...attributes}
  // ... rest
>
```

### 4. Visual Feedback

**Cursor states**:
- Default (on container): `cursor-grab` - indicates draggable
- During pan: `cursor-grabbing` - indicates active drag
- On cards: Keep default cursor (cards have their own cursor)

**CSS additions** (globals.css):

```css
/* Hide scrollbar during pan for cleaner UX */
.panning::-webkit-scrollbar {
  display: none;
}

/* Keyboard navigation hint (optional) */
.board-container:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
```

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/hooks/useBoardPan.ts` | **New** | Custom hook for pan + keyboard navigation |
| `src/components/board/Board.tsx` | Modify | Add ref, use hook, apply handlers & cursor styles |
| `src/components/board/Card.tsx` | Modify | Add `data-draggable="true"` attribute |
| `src/app/globals.css` | Modify | Add panning cursor and scrollbar styles (optional) |

---

## Edge Cases and Considerations

### 1. Touch Devices
The implementation uses Pointer Events, which work for both mouse and touch. Touch users can:
- Drag on cards to move them between columns
- Drag on empty space to pan the board
- Use two-finger scroll (native behavior still works)

### 2. Dialogs and Modals
When `TaskDetail`, `CreateTaskDialog`, or other dialogs are open:
- Arrow keys should NOT scroll the board (handled by checking for `[role="dialog"]`)
- Pan gestures on the overlay should be ignored

### 3. Small Screens / Mobile
On very small screens where the entire board might not be visible:
- Pan functionality becomes even more important
- Consider adding visual scroll indicators (dots or progress bar) in future

### 4. Preventing Text Selection During Pan
During panning, we add `select-none` class to prevent accidental text selection while dragging.

### 5. Right-to-Left (RTL) Support
If RTL support is needed in future:
- Arrow keys should respect document direction
- `scrollLeft` values would need adjustment

---

## Accessibility

1. **Keyboard Navigation**: Arrow keys provide full keyboard access
2. **Screen Readers**: No additional ARIA needed (native scroll semantics apply)
3. **Focus Management**: Consider adding `tabindex="0"` to container for explicit focus

---

## Testing Strategy

### Unit Tests (Vitest + React Testing Library)

```typescript
describe('useBoardPan', () => {
  it('should scroll left on ArrowLeft key', () => {
    // Render hook with mock container
    // Fire keydown event
    // Assert scrollBy was called with negative value
  });

  it('should scroll right on ArrowRight key', () => {
    // Similar to above
  });

  it('should not scroll when input is focused', () => {
    // Focus an input element
    // Fire keydown
    // Assert no scroll occurred
  });

  it('should pan on pointer drag in empty space', () => {
    // Pointer down on container (not card)
    // Pointer move
    // Assert scrollLeft changed
  });

  it('should NOT pan when pointer down on card', () => {
    // Pointer down on element with data-draggable
    // Pointer move
    // Assert scrollLeft unchanged
  });
});
```

### E2E Tests (Playwright)

```typescript
test('can pan board by dragging', async ({ page }) => {
  await page.goto('/');
  
  // Get initial scroll position
  const container = page.locator('.board-container');
  const initialScroll = await container.evaluate(el => el.scrollLeft);
  
  // Drag on empty space
  await container.hover();
  await page.mouse.down();
  await page.mouse.move(-200, 0);
  await page.mouse.up();
  
  // Assert scroll changed
  const newScroll = await container.evaluate(el => el.scrollLeft);
  expect(newScroll).toBeGreaterThan(initialScroll);
});

test('can navigate with arrow keys', async ({ page }) => {
  await page.goto('/');
  
  const container = page.locator('.board-container');
  const initialScroll = await container.evaluate(el => el.scrollLeft);
  
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400); // Wait for smooth scroll
  
  const newScroll = await container.evaluate(el => el.scrollLeft);
  expect(newScroll).toBeGreaterThan(initialScroll);
});
```

---

## Implementation Order

1. Create `useBoardPan.ts` hook
2. Add `data-draggable="true"` to Card.tsx
3. Update Board.tsx to use the hook
4. Add any necessary CSS to globals.css
5. Write unit tests
6. Manual testing on different browsers/devices
7. E2E test

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Conflict with dnd-kit | Medium | High | Use `data-draggable` selector to exclude cards |
| Touch gesture conflicts | Low | Medium | Pointer Events handle both; native scroll still works |
| Performance (frequent scroll) | Low | Low | No re-renders during pan; only scrollLeft mutation |
| Browser compatibility | Low | Low | Pointer Events supported in all modern browsers |

---

## Future Enhancements (Out of Scope)

1. **Scroll position indicators** - Visual dots showing current position
2. **Snap-to-column** - Scroll snaps to column boundaries
3. **Momentum scrolling** - Physics-based inertia after pan release
4. **Mini-map** - Small overview showing all columns and current viewport
5. **Zoom** - Pinch-to-zoom or scroll wheel to scale the board

---

## Summary

This design adds intuitive pan functionality and keyboard navigation to the board with minimal changes:
- 1 new file (hook)
- 3 file modifications (Board, Card, globals.css)

The implementation prioritizes simplicity, accessibility, and non-interference with existing drag-and-drop functionality.

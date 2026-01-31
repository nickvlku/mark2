# Code Review: Board Pan/Drag and Arrow Key Navigation (TASK-16)

## Review Summary

**Status**: ✅ APPROVED - No blocking issues found

**Reviewer**: Code Review Agent
**Date**: 2026-01-31

---

## Files Reviewed

| File | Status | Notes |
|------|--------|-------|
| `src/hooks/useBoardPan.ts` | ✅ New | 129 lines, clean implementation |
| `src/components/board/Board.tsx` | ✅ Modified | Integrates hook correctly |
| `src/components/board/Card.tsx` | ✅ Modified | Added `data-draggable="true"` |
| `src/app/globals.css` | ✅ Modified | Added cursor styles |
| `tests/unit/hooks/useBoardPan.test.ts` | ✅ New | 22 comprehensive test cases |
| `tests/e2e/board.spec.ts` | ✅ Modified | 13 new E2E tests for pan/keyboard |
| `playwright.config.ts` | ✅ Modified | Minor config update |
| `tsconfig.json` | ✅ Modified | Added type includes |

---

## Detailed Analysis

### 1. `useBoardPan.ts` Hook (NEW)

**Strengths:**
- Well-documented interfaces with JSDoc comments
- Proper separation of pointer and keyboard event handling
- Uses `useCallback` to prevent unnecessary re-renders
- Uses refs (`isPointerDown`, `startX`, `scrollLeft`) for values that shouldn't trigger re-renders
- Implements proper cleanup in useEffect for keyboard listeners
- Uses Pointer Events for cross-platform support (mouse + touch)
- 5px movement threshold prevents accidental pans on click

**Implementation Details:**
- `ignoreSelector` parameter allows avoiding conflicts with draggable elements
- `scrollAmount` is configurable (default 320px = one column width)
- `enableKeyboard` flag allows disabling keyboard navigation if needed
- Correctly ignores keyboard events in inputs, textareas, contentEditable, and dialogs

### 2. Board.tsx Integration

**Strengths:**
- Clean integration using spread operators for event handlers
- Conditional cursor classes (`cursor-grab` / `cursor-grabbing`)
- `select-none` during pan prevents text selection
- Proper ref setup with `useRef<HTMLDivElement>(null)`

**Implementation:**
```tsx
const { isPanning, panHandlers } = useBoardPan({
  containerRef: boardContainerRef,
  ignoreSelector: '[data-draggable="true"]',
  scrollAmount: 320,
});
```

### 3. Card.tsx Changes

**Change:** Added `data-draggable="true"` attribute to enable the hook to distinguish draggable cards from empty space.

This is the correct approach - it's a data attribute that doesn't affect styling or accessibility, and allows the pan logic to exclude card elements.

### 4. CSS Changes (globals.css)

**Note:** The `cursor-grab` and `cursor-grabbing` classes defined are actually built-in Tailwind utilities. However, they serve as explicit documentation and ensure the styles exist even if Tailwind config changes.

The scrollbar hiding rule during `select-none` is a nice UX touch for cleaner panning.

### 5. Test Coverage

**Unit Tests (22 tests):**
- ✅ Initialization (isPanning default, handlers exist)
- ✅ Pan Handlers (pointer down, move, up, leave)
- ✅ Threshold behavior (5px minimum movement)
- ✅ Ignore draggable elements
- ✅ Non-left button rejection
- ✅ Keyboard navigation (ArrowLeft, ArrowRight)
- ✅ Custom scroll amount
- ✅ Input/textarea/dialog exclusion
- ✅ Custom ignoreSelector
- ✅ Edge cases (null ref, move without down)
- ✅ Cleanup on unmount

**E2E Tests (13 tests):**
- ✅ Grab cursor on container
- ✅ Pan by dragging empty space
- ✅ No pan when dragging cards
- ✅ Cursor change during pan
- ✅ ArrowRight navigation
- ✅ ArrowLeft navigation
- ✅ No scroll when dialog open
- ✅ No scroll when typing in input
- ✅ Multiple arrow key presses
- ✅ Pan and keyboard work together

---

## Issues Found

### P0 (Must Fix)
None

### P1 (Should Fix)
None

### P2 (Nice to Fix)

1. **Redundant CSS utilities** (lines 98-104 in globals.css)
   - `cursor-grab` and `cursor-grabbing` are built-in Tailwind utilities
   - Not harmful, but slightly redundant
   - **Recommendation**: Keep for documentation, or remove if strict about redundancy

2. **TypeScript test file issues** (useBoardPan.test.ts lines 18, 511)
   - Minor type mismatches in test mocks (`scrollBy` mock signature, null ref type)
   - Tests still pass and behavior is correct
   - **Recommendation**: Add proper type assertions in a future cleanup

3. **Pre-existing TypeScript errors in other tests**
   - Several errors in `cli-tmuxes.test.ts`, `pipeline/phase-transitions.test.ts`, etc.
   - Not related to this task
   - **Recommendation**: Fix in a separate task

---

## Conformance to Design Document

| Requirement | Status |
|-------------|--------|
| Drag-to-Pan on empty space | ✅ Implemented |
| Arrow Key Navigation | ✅ Implemented |
| Non-conflicting with dnd-kit | ✅ Uses data-draggable selector |
| Keyboard accessible | ✅ Works without mouse |
| Mouse and touch support | ✅ Uses Pointer Events |
| Cursor feedback | ✅ grab/grabbing cursor |
| Dialog/input exclusion | ✅ Checked in event handlers |

---

## Security Considerations

- ✅ No security concerns
- No external API calls
- No user data handling
- Standard browser event handling

---

## Performance Considerations

- ✅ No performance concerns
- Uses refs instead of state for frequently-updated values
- No DOM mutations during pan (only scrollLeft updates)
- useCallback prevents handler recreation
- Event listener cleanup on unmount

---

## Accessibility

- ✅ Keyboard navigation provides full access without mouse
- ✅ No ARIA requirements violated (standard scroll semantics)
- ✅ Focus management not affected

---

## Final Verdict

**APPROVED** ✅

The implementation is clean, well-tested, and follows the design document closely. No blocking issues were found. The minor P2 issues are cosmetic and can be addressed in future cleanup if desired.

The feature successfully adds:
1. Drag-to-pan functionality for the board
2. Arrow key navigation (left/right)
3. Proper conflict resolution with existing card drag-and-drop
4. Comprehensive test coverage (22 unit + 13 E2E tests)

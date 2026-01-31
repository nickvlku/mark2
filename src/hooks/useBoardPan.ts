import { useState, useRef, useCallback, useEffect, RefObject } from 'react';

interface UseBoardPanOptions {
  /** Ref to the scrollable container */
  containerRef: RefObject<HTMLElement | null>;
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
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerLeave: (e: React.PointerEvent) => void;
  };
}

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
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
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
    },
    [containerRef, ignoreSelector]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
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
    },
    [containerRef, isPanning]
  );

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
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[role="dialog"]')
      ) {
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

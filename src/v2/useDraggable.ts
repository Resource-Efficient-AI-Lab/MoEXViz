import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface DragOffset {
  x: number;
  y: number;
}

export interface Draggable {
  /** Current offset from the element's normal (CSS-laid-out) position — apply as
   *  `translate(${offset.x}px, ${offset.y}px)` on whichever element should actually move. The
   *  only part of this that changes identity across renders; every function below is stable
   *  (wrapped in `useCallback` off refs, never `offset` itself), so a consumer that needs one of
   *  them in its own dependency array — not just inside a JSX prop — can depend on it directly
   *  (`mathModalDrag.reset`) without that array re-triggering on every render. */
  offset: DragOffset;
  /** Back to no offset — call when a pop-up (re)opens fresh, so a previous drag doesn't carry
   *  over to a session the reader never dragged. */
  reset: () => void;
  /** Spread onto whichever element is the grab handle: the whole pop-up (DomainTab.tsx's tour
   *  card, WorkedExampleModal), or just its header row, when the pop-up's body has its own click
   *  targets a drag-anywhere would otherwise steal (DomainCellModal, AllCategoriesModal, the
   *  Architecture tab's math/router modals — see each one's own comment for why). */
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * One drag-by-translate-offset implementation, shared by every draggable pop-up in the app
 * (guided tours, Worked Example, the click-for-detail modals, the Architecture tab's stage and
 * router modals) — previously duplicated near-verbatim in DomainTab.tsx and
 * WorkedExampleModal.tsx. Pointer-capture based rather than a window-level mousemove listener, so
 * dragging keeps tracking even when the pointer leaves the handle mid-drag.
 *
 * Buttons (close, Exit/Back/Next, a layer pager's ‹ ›, anything else interactive) stay clickable
 * even when the handle wraps them: `closest('button')` refuses to start a drag from one, the same
 * guard every existing draggable pop-up already used before this was extracted.
 *
 * `offsetRef` mirrors `offset` so `onPointerDown` can read the latest value without closing over
 * `offset` itself — that's what lets every handler below be a zero-dependency `useCallback` (a
 * stable reference for the component's whole lifetime) instead of a new function every time the
 * offset changes, which is exactly the render it fires on.
 */
export function useDraggable(): Draggable {
  const [offset, setOffsetState] = useState<DragOffset>({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const setOffset = useCallback((next: DragOffset) => {
    offsetRef.current = next;
    setOffsetState(next);
  }, []);
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null
  );

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const base = offsetRef.current;
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: base.x, baseY: base.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const s = dragState.current;
      if (!s) return;
      setOffset({ x: s.baseX + (e.clientX - s.startX), y: s.baseY + (e.clientY - s.startY) });
    },
    [setOffset]
  );
  const onPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);
  const reset = useCallback(() => setOffset({ x: 0, y: 0 }), [setOffset]);

  return { offset, reset, onPointerDown, onPointerMove, onPointerUp };
}

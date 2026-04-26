import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { LETTER_VALUES } from './letterValues';

/**
 * What's being dragged. The drop handler in App decides what each
 * (source × target) combination means in game terms.
 *
 *   letter      — a letter tile from the on-screen keyboard
 *   backspace   — the ⌫ tile (acts as Remove on the target cell)
 *   space       — the Space tile (sets the target cell to a space)
 *   board-cell  — a letter picked up from the board itself; dropping on
 *                 another cell is a swap, dropping off-board cancels.
 */
export type DragSource =
  | { kind: 'letter'; letter: string }
  | { kind: 'backspace' }
  | { kind: 'space' }
  | { kind: 'board-cell'; idx: number; letter: string };

type DragState = {
  /** The source being actively dragged (post-threshold). null = not dragging. */
  active: DragSource | null;
  /** Latest pointer position in viewport coordinates. */
  pointerPos: { x: number; y: number } | null;
  /** Cell index (0–4) the pointer is currently over, or null if off-board. */
  hoverTargetIdx: number | null;
};

type DragContextValue = {
  state: DragState;
  /** Call from a draggable element's onPointerDown to register a potential drag. */
  startDrag: (source: DragSource, e: React.PointerEvent) => void;
};

const DragContext = createContext<DragContextValue | null>(null);

/**
 * Drag begins once the pointer has moved this many CSS pixels from the
 * pointerdown position. Below the threshold, releases pass through as
 * normal click events — that's how tap-to-place stays functional as a
 * fallback alongside the drag affordance.
 */
const DRAG_START_THRESHOLD_PX = 5;

/**
 * Mark drop targets with this data attribute (value = cell index 0–4).
 * The drag system uses elementFromPoint to identify the target, which
 * means cells don't each need to wire their own pointer-enter/leave
 * handlers — the source of truth is the geometry under the pointer.
 */
export const DROP_TARGET_ATTR = 'data-drop-target-idx';

export function DragProvider({
  children,
  onDrop,
}: {
  children: ReactNode;
  /** Called once on pointer-up. targetIdx is null if released off any cell. */
  onDrop: (source: DragSource, targetIdx: number | null) => void;
}) {
  const [state, setState] = useState<DragState>({
    active: null,
    pointerPos: null,
    hoverTargetIdx: null,
  });

  // Refs so the global pointer listeners read fresh values without
  // re-subscribing on every state change.
  const pendingRef = useRef<{ source: DragSource; startX: number; startY: number } | null>(null);
  const activeRef = useRef<DragSource | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const startDrag = useCallback((source: DragSource, e: React.PointerEvent) => {
    // preventDefault stops the browser's default drag image / text selection
    // from kicking in when we have our own ghost.
    e.preventDefault();
    pendingRef.current = { source, startX: e.clientX, startY: e.clientY };
  }, []);

  useEffect(() => {
    const targetIdxAt = (x: number, y: number): number | null => {
      const elem = document.elementFromPoint(x, y);
      const target = elem?.closest(`[${DROP_TARGET_ATTR}]`) as HTMLElement | null;
      const raw = target?.getAttribute(DROP_TARGET_ATTR);
      if (raw == null) return null;
      const idx = parseInt(raw, 10);
      return Number.isFinite(idx) ? idx : null;
    };

    const handleMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending) return;

      // Promote pending → active once the pointer has crossed the threshold.
      if (!activeRef.current) {
        const dist = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY);
        if (dist < DRAG_START_THRESHOLD_PX) return;
        activeRef.current = pending.source;
      }

      setState({
        active: activeRef.current,
        pointerPos: { x: e.clientX, y: e.clientY },
        hoverTargetIdx: targetIdxAt(e.clientX, e.clientY),
      });
    };

    const handleUp = (e: PointerEvent) => {
      if (!pendingRef.current) return;
      const wasActive = activeRef.current;

      pendingRef.current = null;
      activeRef.current = null;

      if (!wasActive) {
        // Below threshold — treat as a click. The element's own onClick
        // handler will fire on the natural click event that follows.
        setState({ active: null, pointerPos: null, hoverTargetIdx: null });
        return;
      }

      // Suppress the synthetic click that follows pointerup, so a completed
      // drag doesn't ALSO trigger the source's onClick (which would re-place
      // the letter via the tap-fallback path).
      const suppress = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      window.addEventListener('click', suppress, { once: true, capture: true });
      // Backstop in case no click event materializes (e.g., released
      // outside any clickable element).
      setTimeout(() => window.removeEventListener('click', suppress, { capture: true }), 100);

      const targetIdx = targetIdxAt(e.clientX, e.clientY);
      setState({ active: null, pointerPos: null, hoverTargetIdx: null });
      onDropRef.current(wasActive, targetIdx);
    };

    const handleCancel = () => {
      pendingRef.current = null;
      activeRef.current = null;
      setState({ active: null, pointerPos: null, hoverTargetIdx: null });
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, []);

  return (
    <DragContext.Provider value={{ state, startDrag }}>
      {children}
      {state.active && state.pointerPos && (
        <DragGhost source={state.active} pos={state.pointerPos} />
      )}
    </DragContext.Provider>
  );
}

export function useDrag(): DragContextValue {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('useDrag must be used within a <DragProvider>.');
  return ctx;
}

/**
 * Floating tile that follows the pointer during an active drag. Sized to
 * roughly match a board cell so the user sees the drop preview at the
 * right scale. The grab point is at (50%, 80%) of the tile so the letter
 * sits visibly above the finger on mobile rather than disappearing under
 * it; on desktop the same offset keeps the cursor as the bottom anchor
 * and the tile floats just above.
 */
function DragGhost({ source, pos }: { source: DragSource; pos: { x: number; y: number } }) {
  const label =
    source.kind === 'letter' ? source.letter
    : source.kind === 'backspace' ? '⌫'
    : source.kind === 'space' ? '␣'
    : source.letter;

  const value =
    source.kind === 'letter' ? LETTER_VALUES[source.letter] ?? 0
    : source.kind === 'board-cell' ? LETTER_VALUES[source.letter] ?? 0
    : null;

  return (
    <div
      className="gapplet-tile"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -80%)',
        width: '90px',
        height: '90px',
        borderRadius: '8px',
        fontSize: '38px',
        fontWeight: 700,
        fontFamily: 'Georgia, "Times New Roman", serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 9999,
        opacity: 0.92,
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.25)',
      }}
    >
      <span>{label}</span>
      {value !== null && (
        <span
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '6px',
            fontSize: '11px',
            fontWeight: 600,
            opacity: 0.7,
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

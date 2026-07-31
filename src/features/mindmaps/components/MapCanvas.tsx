import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { MindMapGraph, MindMapNode, MindMapNodeColor } from '@/types/database'
import { cn } from '@/lib/utils'
import {
  type MapView,
  type Point,
  NODE_W,
  clipToBox,
  nodeSize,
  screenToWorld,
  truncate,
  wrapNote,
  zoomAt,
} from '../graph'

/**
 * The canvas. Hand-rolled SVG + pointer events — no graph library.
 *
 * react-flow is ~50kB gzipped and d3-force more again, and neither is needed:
 * this draws boxes and straight lines, and there is no automatic layout to
 * compute. Everything that could be numerically wrong lives in `graph.ts` and is
 * unit-tested, so what is left here is genuinely only plumbing.
 *
 * ONE POINTER MODEL FOR EVERYTHING. `pointerdown`/`move`/`up` with
 * `setPointerCapture` covers mouse, pen and touch identically, which is why
 * there are no touch handlers: a drag that starts on a node keeps receiving
 * events even when the finger leaves the node (or the window), so a node can
 * never get stuck to the cursor. Two simultaneous pointers become a pinch.
 *
 * MOVES ARE COALESCED TO ONE PER FRAME. A pointermove can fire more often than
 * the display refreshes, and each one re-renders every node; without the rAF
 * gate a 200-node map drops frames on a phone for no visible benefit.
 *
 * KEYBOARD IS FIRST-CLASS, NOT AN AFTERTHOUGHT. Every node is a focusable
 * button: arrows move it, Enter opens it, Delete removes it. The page also
 * renders a plain list of the same nodes with the same actions, so the whole
 * feature is usable with no pointer and no reliance on SVG focus behaviour.
 */

export type CanvasMode = 'select' | 'connect'

interface MapCanvasProps {
  graph: MindMapGraph
  view: MapView
  onViewChange: (view: MapView) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** In connect mode, the node waiting for a partner. */
  connectFrom: string | null
  mode: CanvasMode
  /** Tap / Enter. In connect mode the page turns two of these into a line. */
  onActivate: (id: string) => void
  /** Live during a drag — the page applies it to the graph. */
  onNodeMove: (id: string, x: number, y: number) => void
  /** The drag finished; a save may be scheduled. */
  onNodeMoveEnd: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  className?: string
}

/** Design tokens, never raw hex — the node colour is a token name end to end. */
const STROKE: Record<MindMapNodeColor, string> = {
  brand: 'stroke-brand',
  accent: 'stroke-accent',
  success: 'stroke-success',
  warning: 'stroke-warning',
  danger: 'stroke-danger',
}
const FILL: Record<MindMapNodeColor, string> = {
  brand: 'fill-brand',
  accent: 'fill-accent',
  success: 'fill-success',
  warning: 'fill-warning',
  danger: 'fill-danger',
}

/** How far an arrow key nudges a node, in world units. */
const NUDGE = 24
const NUDGE_FINE = 6

type Drag =
  | { kind: 'none' }
  | { kind: 'pan'; pointerId: number; startX: number; startY: number; startView: MapView }
  | { kind: 'node'; pointerId: number; id: string; grabX: number; grabY: number; moved: boolean }

export function MapCanvas({
  graph,
  view,
  onViewChange,
  selectedId,
  onSelect,
  connectFrom,
  mode,
  onActivate,
  onNodeMove,
  onNodeMoveEnd,
  onEdit,
  onDelete,
  className,
}: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag>({ kind: 'none' })
  /** Live pointer positions, so two of them can become a pinch. */
  const pointers = useRef(new Map<number, Point>())
  const pinch = useRef<{ dist: number; mid: Point } | null>(null)
  const frame = useRef(0)
  const pending = useRef<(() => void) | null>(null)

  // The latest view, readable from a pointer handler without re-subscribing the
  // native wheel listener on every camera change.
  const viewRef = useRef(view)
  viewRef.current = view

  /** Client coordinates → coordinates inside the canvas box. */
  const local = useCallback((e: { clientX: number; clientY: number }): Point => {
    const box = hostRef.current?.getBoundingClientRect()
    return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) }
  }, [])

  /** Run `fn` at most once per animation frame. */
  const schedule = useCallback((fn: () => void) => {
    pending.current = fn
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const run = pending.current
      pending.current = null
      run?.()
    })
  }, [])

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    },
    [],
  )

  /**
   * Wheel zoom, attached natively because React's wheel listener is passive:
   * calling preventDefault on it warns and does nothing, and without it the
   * whole page scrolls while the user is trying to zoom the map.
   */
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const box = el.getBoundingClientRect()
      const anchor = { x: e.clientX - box.left, y: e.clientY - box.top }
      // deltaMode 1 is lines, 2 is pages — normalise so a trackpad and a mouse
      // wheel do not differ by two orders of magnitude.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.height : 1
      onViewChange(zoomAt(viewRef.current, Math.exp(-e.deltaY * unit * 0.0016), anchor))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onViewChange])

  function beginPan(e: React.PointerEvent) {
    const p = local(e)
    drag.current = {
      kind: 'pan',
      pointerId: e.pointerId,
      startX: p.x,
      startY: p.y,
      startView: view,
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    // Only primary buttons pan; a right-click should still open the context menu.
    if (e.button !== 0) return
    pointers.current.set(e.pointerId, local(e))
    e.currentTarget.setPointerCapture(e.pointerId)

    if (pointers.current.size === 2) {
      // A second finger cancels whatever single-pointer gesture was running and
      // starts a pinch — otherwise the first finger keeps dragging a node while
      // the map scales under it.
      drag.current = { kind: 'none' }
      pinch.current = pinchState()
      return
    }
    beginPan(e)
    onSelect(null)
  }

  function onNodePointerDown(e: React.PointerEvent, node: MindMapNode) {
    if (e.button !== 0) return
    e.stopPropagation()
    pointers.current.set(e.pointerId, local(e))
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const world = screenToWorld(local(e), view)
    drag.current = {
      kind: 'node',
      pointerId: e.pointerId,
      id: node.id,
      // Grab OFFSET, not centre: without it the node jumps so its middle lands
      // under the cursor the instant you touch its corner.
      grabX: node.x - world.x,
      grabY: node.y - world.y,
      moved: false,
    }
    onSelect(node.id)
  }

  function pinchState() {
    const [a, b] = [...pointers.current.values()]
    if (!a || !b) return null
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, local(e))

    if (pointers.current.size >= 2) {
      const next = pinchState()
      const prev = pinch.current
      pinch.current = next
      if (!next || !prev || prev.dist === 0) return
      schedule(() => {
        // Zoom by the change in finger separation, and pan by the change in
        // their midpoint, so a two-finger drag scales AND moves like a photo.
        const zoomed = zoomAt(viewRef.current, next.dist / prev.dist, next.mid)
        onViewChange({
          ...zoomed,
          tx: zoomed.tx + (next.mid.x - prev.mid.x),
          ty: zoomed.ty + (next.mid.y - prev.mid.y),
        })
      })
      return
    }

    const d = drag.current
    if (d.kind === 'pan' && d.pointerId === e.pointerId) {
      const p = local(e)
      schedule(() =>
        onViewChange({
          ...d.startView,
          tx: d.startView.tx + (p.x - d.startX),
          ty: d.startView.ty + (p.y - d.startY),
        }),
      )
      return
    }
    if (d.kind === 'node' && d.pointerId === e.pointerId) {
      const p = local(e)
      d.moved = true
      schedule(() => {
        const world = screenToWorld(p, viewRef.current)
        onNodeMove(d.id, Math.round(world.x + d.grabX), Math.round(world.y + d.grabY))
      })
    }
  }

  function endPointer(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    const d = drag.current
    if (d.kind === 'node' && d.pointerId === e.pointerId) {
      drag.current = { kind: 'none' }
      // A tap is a drag that never moved. Only a real move needs saving.
      if (d.moved) onNodeMoveEnd()
      else onActivate(d.id)
      return
    }
    if (d.kind === 'pan' && d.pointerId === e.pointerId) drag.current = { kind: 'none' }
  }

  function onNodeKeyDown(e: React.KeyboardEvent, node: MindMapNode) {
    const step = e.shiftKey ? NUDGE_FINE : NUDGE
    const move = (dx: number, dy: number) => {
      e.preventDefault()
      onNodeMove(node.id, node.x + dx, node.y + dy)
      onNodeMoveEnd()
    }
    switch (e.key) {
      case 'ArrowLeft':
        return move(-step, 0)
      case 'ArrowRight':
        return move(step, 0)
      case 'ArrowUp':
        return move(0, -step)
      case 'ArrowDown':
        return move(0, step)
      case 'Enter':
      case ' ':
        e.preventDefault()
        return mode === 'connect' ? onActivate(node.id) : onEdit(node.id)
      case 'Delete':
      case 'Backspace':
        if (node.root) return
        e.preventDefault()
        return onDelete(node.id)
      default:
    }
  }

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes])

  return (
    <div
      ref={hostRef}
      className={cn(
        'relative touch-none overflow-hidden rounded-2xl border border-white/5 bg-surface/40',
        mode === 'connect' && 'cursor-crosshair',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <svg className="h-full w-full" role="presentation">
        <defs>
          <pattern
            id="mm-dots"
            width={32}
            height={32}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}
          >
            <circle cx={1.5} cy={1.5} r={1.5} className="fill-white/[0.06]" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mm-dots)" />

        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          {/* Lines first so nodes always sit on top of them. */}
          {graph.edges.map((edge) => {
            const a = byId.get(edge.from)
            const b = byId.get(edge.to)
            if (!a || !b) return null
            const from = clipToBox(b, a, nodeSize(a))
            const to = clipToBox(a, b, nodeSize(b))
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                strokeWidth={2}
                strokeLinecap="round"
                className="stroke-white/20"
              />
            )
          })}

          {graph.nodes.map((node) => (
            <NodeShape
              key={node.id}
              node={node}
              selected={node.id === selectedId}
              pairing={node.id === connectFrom}
              mode={mode}
              onPointerDown={(e) => onNodePointerDown(e, node)}
              onKeyDown={(e) => onNodeKeyDown(e, node)}
              onDoubleClick={() => onEdit(node.id)}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}

interface NodeShapeProps {
  node: MindMapNode
  selected: boolean
  pairing: boolean
  mode: CanvasMode
  onPointerDown: (e: React.PointerEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onDoubleClick: () => void
}

function NodeShape({
  node,
  selected,
  pairing,
  mode,
  onPointerDown,
  onKeyDown,
  onDoubleClick,
}: NodeShapeProps) {
  const { w, h } = nodeSize(node)
  const x = node.x - w / 2
  const y = node.y - h / 2
  const noteLines = node.note ? wrapNote(node.note, 26, 2) : []
  const linked = !!(node.projectId || node.taskId)

  const label = [
    node.title,
    node.root ? ' (centre)' : '',
    node.note ? `, ${node.note}` : '',
    linked ? ', linked' : '',
    mode === 'connect' ? '. Press Enter to connect.' : '. Press Enter to edit.',
  ]
    .filter(Boolean)
    .join('')

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={pairing}
      className="focus:outline-none [&:focus-visible>rect:first-of-type]:stroke-[3]"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
      style={{ cursor: mode === 'connect' ? 'crosshair' : 'grab' }}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        strokeWidth={selected || pairing ? 2.5 : 1.5}
        className={cn(
          'fill-surface',
          pairing ? 'stroke-accent' : selected ? 'stroke-brand' : STROKE[node.color],
          !selected && !pairing && 'opacity-90',
        )}
      />
      {/* The colour bar: the node's token colour, always visible even when the
          outline is showing selection instead. */}
      <rect x={x + 1} y={y + 12} width={4} height={h - 24} rx={2} className={FILL[node.color]} />

      <text
        x={x + 16}
        y={y + (noteLines.length ? 27 : h / 2 + 5)}
        className="fill-text-primary font-sans text-[15px] font-medium"
        style={{ pointerEvents: 'none' }}
      >
        {truncate(node.title, 22)}
      </text>

      {noteLines.map((line, i) => (
        <text
          key={i}
          x={x + 16}
          y={y + 50 + i * 17}
          className="fill-text-muted font-sans text-[12px]"
          style={{ pointerEvents: 'none' }}
        >
          {line}
        </text>
      ))}

      {node.root && (
        <circle cx={x + w - 14} cy={y + 14} r={4} className="fill-text-muted" aria-hidden />
      )}
      {linked && (
        <circle cx={x + w - 14} cy={y + h - 14} r={4} className="fill-accent" aria-hidden />
      )}
    </g>
  )
}

export { NODE_W }

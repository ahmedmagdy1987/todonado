import type { MindMapEdge, MindMapGraph, MindMapNode, MindMapNodeColor } from '@/types/database'

/**
 * Pure logic for mind maps. No React, no I/O, no DOM — unit-tested.
 *
 * Everything the canvas does that could be wrong is in here: the graph
 * operations, the caps, the camera maths, and the defensive read of a jsonb
 * column the database cannot fully constrain. The component on top is then only
 * pointer plumbing and SVG.
 *
 * WORLD vs SCREEN. Node coordinates are WORLD coordinates and never change when
 * you pan or zoom — that is what makes a map stable across devices with
 * different viewports. The camera (`MapView`) is scale + translation, applied
 * once as an SVG transform, and lives only in component state: it is never
 * saved, because where someone was last looking is not part of their map.
 */

// ---------------------------------------------------------------------------
//  Caps. The count caps mirror the CHECK constraints in
//  20260731120000_mind_maps.sql and are pinned to them by mindMapCaps.test.ts.
//  The text caps have no DB twin (the migration backstops with a byte cap
//  instead — see its header) and are enforced here on the way in.
// ---------------------------------------------------------------------------
export const MAX_MAP_TITLE = 80
export const MAX_MAP_NODES = 200
export const MAX_MAP_EDGES = 400
export const MAX_NODE_TITLE = 60
export const MAX_NODE_NOTE = 240

/** The five accent colours a node may take — design tokens, not free hex. */
export const NODE_COLORS: readonly MindMapNodeColor[] = [
  'brand',
  'accent',
  'success',
  'warning',
  'danger',
] as const

const DEFAULT_COLOR: MindMapNodeColor = 'brand'

// ---------------------------------------------------------------------------
//  Geometry
// ---------------------------------------------------------------------------

export interface Size {
  w: number
  h: number
}
export interface Point {
  x: number
  y: number
}
export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Node box, in world units. A note makes it taller; nothing else changes it. */
export const NODE_W = 176
export const NODE_H_PLAIN = 56
export const NODE_H_NOTE = 92

export function nodeSize(node: Pick<MindMapNode, 'note'>): Size {
  return { w: NODE_W, h: node.note && node.note.trim() ? NODE_H_NOTE : NODE_H_PLAIN }
}

/**
 * Where a line from `from` to `to` should STOP so it meets the edge of `to`'s
 * box instead of disappearing under it. Pure ray/rectangle intersection.
 *
 * Returns the box centre when the two centres coincide — degenerate, but a
 * NaN here would blank the whole SVG, and two nodes CAN be dropped exactly on
 * top of each other.
 */
export function clipToBox(from: Point, to: Point, size: Size): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return { x: to.x, y: to.y }

  const hw = size.w / 2
  const hh = size.h / 2
  // Scale the ray down until it lands on the nearer of the two box edges.
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx)
  const sy = dy === 0 ? Infinity : hh / Math.abs(dy)
  const s = Math.min(sx, sy)
  return { x: to.x - dx * s, y: to.y - dy * s }
}

/** The bounding box of every node, INCLUDING its box, not just its centre. */
export function boundsOf(nodes: MindMapNode[]): Bounds | null {
  if (nodes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const { w, h } = nodeSize(n)
    minX = Math.min(minX, n.x - w / 2)
    minY = Math.min(minY, n.y - h / 2)
    maxX = Math.max(maxX, n.x + w / 2)
    maxY = Math.max(maxY, n.y + h / 2)
  }
  return { minX, minY, maxX, maxY }
}

// ---------------------------------------------------------------------------
//  Camera
// ---------------------------------------------------------------------------

export interface MapView {
  scale: number
  /** Translation in SCREEN pixels, applied after scaling. */
  tx: number
  ty: number
}

export const MIN_SCALE = 0.25
export const MAX_SCALE = 2.5

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export const IDENTITY_VIEW: MapView = { scale: 1, tx: 0, ty: 0 }

export function worldToScreen(p: Point, view: MapView): Point {
  return { x: p.x * view.scale + view.tx, y: p.y * view.scale + view.ty }
}

export function screenToWorld(p: Point, view: MapView): Point {
  return { x: (p.x - view.tx) / view.scale, y: (p.y - view.ty) / view.scale }
}

/**
 * Zoom by `factor` while keeping the world point currently under `anchor`
 * (a screen point) exactly where it is. This is what makes wheel-zoom and pinch
 * feel like the content is being scaled rather than teleporting.
 *
 * Clamping happens FIRST so the anchor maths uses the scale actually applied —
 * otherwise zooming past a limit would still drift the map sideways.
 */
export function zoomAt(view: MapView, factor: number, anchor: Point): MapView {
  const scale = clampScale(view.scale * factor)
  const applied = scale / view.scale
  return {
    scale,
    tx: anchor.x - (anchor.x - view.tx) * applied,
    ty: anchor.y - (anchor.y - view.ty) * applied,
  }
}

/**
 * The camera that fits `bounds` inside `viewport` with `padding` px to spare.
 * Never zooms IN past 1: a two-node map blown up to fill a desktop screen looks
 * broken, and there is nothing to see in the extra pixels anyway.
 */
export function fitView(bounds: Bounds | null, viewport: Size, padding = 48): MapView {
  if (!bounds || viewport.w <= 0 || viewport.h <= 0) return IDENTITY_VIEW
  const w = Math.max(1, bounds.maxX - bounds.minX)
  const h = Math.max(1, bounds.maxY - bounds.minY)
  // On a 390px phone a flat 48px inset either side is a quarter of the screen,
  // and the map shrinks to pay for margin nobody asked for.
  const pad = Math.min(padding, viewport.w * 0.08, viewport.h * 0.08)
  const scale = clampScale(Math.min(1, (viewport.w - pad * 2) / w, (viewport.h - pad * 2) / h))
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  return { scale, tx: viewport.w / 2 - cx * scale, ty: viewport.h / 2 - cy * scale }
}

/** The camera that puts one world point in the middle of the viewport. */
export function centreOn(point: Point, viewport: Size, scale: number): MapView {
  const s = clampScale(scale)
  return { scale: s, tx: viewport.w / 2 - point.x * s, ty: viewport.h / 2 - point.y * s }
}

/**
 * Below this, node titles stop being readable and the map is decoration.
 * Measured against the 15px label at 176px wide, not chosen for roundness.
 */
export const READABLE_SCALE = 0.55

/**
 * The camera a map OPENS with — which is not the same question as "fit".
 *
 * Fitting is right on a desktop and wrong on a phone: a five-node map fitted
 * into 390px lands at 35%, where every label is a grey smudge and the first
 * thing the user must do is zoom back in. So: fit if the result is still
 * readable, otherwise open at the readable floor centred on the ROOT — the one
 * node that is always meaningful — and let the user pan or press Fit.
 *
 * The Fit BUTTON keeps meaning fit, unconditionally. A control labelled "fit"
 * that declined to fit would be worse than the problem.
 */
export function openingView(nodes: MindMapNode[], viewport: Size): MapView {
  const fit = fitView(boundsOf(nodes), viewport)
  if (fit.scale >= READABLE_SCALE || viewport.w <= 0) return fit
  const root = nodes.find((n) => n.root) ?? nodes[0]
  if (!root) return fit
  return centreOn(root, viewport, READABLE_SCALE)
}

// ---------------------------------------------------------------------------
//  Graph operations
//
//  Every one is IMMUTABLE and returns a new graph. A refused operation returns
//  the graph it was given, unchanged — so a caller that ignores the result can
//  never corrupt the map, and "did it apply?" is a reference comparison.
// ---------------------------------------------------------------------------

export const ROOT_NODE_ID = 'root'

/** A fresh map: one root node at the origin, nothing else. */
export function emptyGraph(rootTitle = 'Start here'): MindMapGraph {
  return {
    nodes: [
      {
        id: ROOT_NODE_ID,
        title: rootTitle.slice(0, MAX_NODE_TITLE),
        note: null,
        x: 0,
        y: 0,
        color: DEFAULT_COLOR,
        root: true,
        projectId: null,
        taskId: null,
      },
    ],
    edges: [],
  }
}

export interface NewNodeInput {
  id: string
  title: string
  note?: string | null
  x: number
  y: number
  color?: MindMapNodeColor
  projectId?: string | null
  taskId?: string | null
}

export function addNode(graph: MindMapGraph, input: NewNodeInput): MindMapGraph {
  const title = input.title.trim()
  if (!title) return graph
  if (graph.nodes.length >= MAX_MAP_NODES) return graph
  if (graph.nodes.some((n) => n.id === input.id)) return graph
  const node: MindMapNode = {
    id: input.id,
    title: title.slice(0, MAX_NODE_TITLE),
    note: normaliseNote(input.note),
    x: input.x,
    y: input.y,
    color: input.color ?? DEFAULT_COLOR,
    // `root` is never set here: a map has exactly one root and it is the one
    // emptyGraph made. Promoting a second would make "the centre" ambiguous.
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
  }
  return { ...graph, nodes: [...graph.nodes, node] }
}

export type NodePatch = Partial<
  Pick<MindMapNode, 'title' | 'note' | 'color' | 'projectId' | 'taskId'>
>

export function updateNode(graph: MindMapGraph, id: string, patch: NodePatch): MindMapGraph {
  let changed = false
  const nodes = graph.nodes.map((n) => {
    if (n.id !== id) return n
    const title = patch.title === undefined ? n.title : patch.title.trim().slice(0, MAX_NODE_TITLE)
    if (!title) return n // refuse to blank a node's name
    changed = true
    return {
      ...n,
      title,
      note: patch.note === undefined ? n.note : normaliseNote(patch.note),
      color: patch.color ?? n.color,
      projectId: patch.projectId === undefined ? n.projectId : (patch.projectId ?? null),
      taskId: patch.taskId === undefined ? n.taskId : (patch.taskId ?? null),
    }
  })
  return changed ? { ...graph, nodes } : graph
}

/** Drag. Kept separate from updateNode because it fires at pointer rate. */
export function moveNode(graph: MindMapGraph, id: string, x: number, y: number): MindMapGraph {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return graph
  let changed = false
  const nodes = graph.nodes.map((n) => {
    if (n.id !== id || (n.x === x && n.y === y)) return n
    changed = true
    return { ...n, x, y }
  })
  return changed ? { ...graph, nodes } : graph
}

/**
 * Delete a node and every line touching it — an edge to a node that no longer
 * exists would render as a line to nowhere and, worse, would still count
 * against the edge cap.
 *
 * THE ROOT IS NOT DELETABLE. Every map keeps its centre; the root can be renamed
 * and recoloured like anything else, so this costs nothing and removes the state
 * where a map has no anchor at all.
 */
export function deleteNode(graph: MindMapGraph, id: string): MindMapGraph {
  const node = graph.nodes.find((n) => n.id === id)
  if (!node || node.root) return graph
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
  }
}

/** Is there already a line between these two, in either direction? */
export function areConnected(graph: MindMapGraph, a: string, b: string): boolean {
  return graph.edges.some(
    (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
  )
}

/**
 * Connect two nodes. Refuses a self-loop, a duplicate (in either direction —
 * these lines have no direction, so A→B and B→A are the same line), an unknown
 * endpoint, and anything past the cap.
 */
export function connect(graph: MindMapGraph, id: string, from: string, to: string): MindMapGraph {
  if (from === to) return graph
  if (graph.edges.length >= MAX_MAP_EDGES) return graph
  if (graph.edges.some((e) => e.id === id)) return graph
  if (!graph.nodes.some((n) => n.id === from)) return graph
  if (!graph.nodes.some((n) => n.id === to)) return graph
  if (areConnected(graph, from, to)) return graph
  return { ...graph, edges: [...graph.edges, { id, from, to }] }
}

/** Remove one line. Both nodes stay. */
export function disconnect(graph: MindMapGraph, edgeId: string): MindMapGraph {
  const edges = graph.edges.filter((e) => e.id !== edgeId)
  return edges.length === graph.edges.length ? graph : { ...graph, edges }
}

/** Remove the line between two nodes, whichever way round it was drawn. */
export function disconnectBetween(graph: MindMapGraph, a: string, b: string): MindMapGraph {
  const edge = graph.edges.find(
    (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
  )
  return edge ? disconnect(graph, edge.id) : graph
}

// ---------------------------------------------------------------------------
//  Placement
// ---------------------------------------------------------------------------

/**
 * Where a NEW node goes when the user adds one without pointing at a spot:
 * on a ring around `origin`, at the first angle that is not already occupied.
 *
 * Deterministic (no randomness) so the same map always lays out the same way,
 * and so the test can assert it. Once the ring is full it spirals outward rather
 * than stacking — nodes dropped exactly on top of each other are unusable.
 */
export function nextNodePosition(nodes: MindMapNode[], origin: Point = { x: 0, y: 0 }): Point {
  // Six per ring rather than eight, at a radius wide enough that adjacent slots
  // clear a FULL node box. An earlier version used eight at 220 and tested
  // occupancy against 0.75 × the box width — so "not taken" and "not
  // overlapping" were different questions, and the layout drew boxes through
  // each other while passing its own check. The threshold below is the real box.
  const STEP = 6
  const RADIUS = 260
  const taken = (p: Point) =>
    nodes.some(
      (n) => Math.abs(n.x - p.x) < NODE_W && Math.abs(n.y - p.y) < NODE_H_NOTE,
    )

  for (let ring = 1; ring <= 6; ring += 1) {
    for (let i = 0; i < STEP; i += 1) {
      const angle = (i / STEP) * Math.PI * 2 + (ring % 2 ? 0 : Math.PI / STEP)
      const p = {
        x: Math.round(origin.x + Math.cos(angle) * RADIUS * ring),
        y: Math.round(origin.y + Math.sin(angle) * RADIUS * 0.62 * ring),
      }
      if (!taken(p)) return p
    }
  }
  // Every ring full (48 nodes clustered on one origin). Fall back to a column
  // that is guaranteed clear rather than returning something overlapping.
  return { x: origin.x, y: origin.y + 100 * (nodes.length + 1) }
}

// ---------------------------------------------------------------------------
//  Text fitting
//
//  SVG <text> does not wrap and does not ellipsise: an over-long string simply
//  runs out of its box and across the rest of the map. These two do the job the
//  browser would do in HTML, and they are here rather than in the component
//  because "does the label fit" is exactly the kind of thing that breaks
//  silently and can be pinned by a test.
// ---------------------------------------------------------------------------

/** Shorten to `max` characters, ending in an ellipsis when it had to cut. */
export function truncate(text: string, max: number): string {
  if (max <= 0) return ''
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/**
 * Break a note into at most `maxLines` lines of at most `perLine` characters,
 * on word boundaries where possible. The final line is ellipsised if anything
 * was dropped, so a truncated note always LOOKS truncated.
 */
export function wrapNote(note: string, perLine: number, maxLines: number): string[] {
  const words = note.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0 || perLine <= 0 || maxLines <= 0) return []

  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= perLine) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    if (lines.length === maxLines) {
      // Out of room. APPEND the ellipsis rather than relying on truncate to add
      // one: the last line is usually well within `perLine` (that is why the
      // next word did not fit), so a length-based cut would leave no sign at all
      // that anything was dropped. Re-truncating afterwards keeps it in budget.
      lines[maxLines - 1] = truncate(`${lines[maxLines - 1]}…`, perLine)
      return lines
    }
    // A single word longer than the line gets hard-cut rather than overflowing.
    line = word.length > perLine ? truncate(word, perLine) : word
  }
  if (line) lines.push(line)
  return lines.slice(0, maxLines)
}

// ---------------------------------------------------------------------------
//  Validation + defensive parsing
// ---------------------------------------------------------------------------

export type ValidationResult = { ok: true } | { ok: false; error: string }

export function validateMapTitle(title: string): ValidationResult {
  const t = title.trim()
  if (!t) return { ok: false, error: 'Give the map a name.' }
  if (t.length > MAX_MAP_TITLE) {
    return { ok: false, error: `Keep the name under ${MAX_MAP_TITLE} characters.` }
  }
  return { ok: true }
}

export function validateNode(draft: { title: string; note: string | null }): ValidationResult {
  const t = draft.title.trim()
  if (!t) return { ok: false, error: 'Give the idea a name.' }
  if (t.length > MAX_NODE_TITLE) {
    return { ok: false, error: `Keep it under ${MAX_NODE_TITLE} characters.` }
  }
  if ((draft.note ?? '').length > MAX_NODE_NOTE) {
    return { ok: false, error: `Keep the note under ${MAX_NODE_NOTE} characters.` }
  }
  return { ok: true }
}

/** May this user create ANOTHER map? Creation only — existing maps always open. */
export function canCreateMindMap(currentCount: number, isPro: boolean, limit: number): boolean {
  if (isPro) return true
  return currentCount < limit
}

function normaliseNote(note: string | null | undefined): string | null {
  const n = (note ?? '').trim()
  return n ? n.slice(0, MAX_NODE_NOTE) : null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Read a graph out of two jsonb columns the database cannot fully constrain.
 *
 * The column is `jsonb` with a byte cap and an is-an-array check — everything
 * inside it is this function's problem. A row could have been written by an
 * older build, a future build, or curl. So: anything unreadable is DROPPED, and
 * what remains is always a coherent graph — no duplicate ids, no edge pointing
 * at a node that isn't there, no NaN coordinates, exactly one root, and never
 * more than the caps allow.
 *
 * Dropping beats throwing. A map that opens with one weird node missing is
 * recoverable; a page that crashes on load is not, and the user cannot even see
 * what they'd lose.
 */
export function normaliseMap(rawNodes: unknown, rawEdges: unknown): MindMapGraph {
  const nodes: MindMapNode[] = []
  const seen = new Set<string>()

  if (Array.isArray(rawNodes)) {
    for (const raw of rawNodes) {
      if (nodes.length >= MAX_MAP_NODES) break
      if (!isRecord(raw)) continue
      const id = str(raw.id)
      const title = str(raw.title)
      const x = num(raw.x)
      const y = num(raw.y)
      if (!id || !title || x === null || y === null || seen.has(id)) continue
      seen.add(id)
      const color = raw.color
      nodes.push({
        id,
        title: title.slice(0, MAX_NODE_TITLE),
        note: normaliseNote(typeof raw.note === 'string' ? raw.note : null),
        x,
        y,
        color: NODE_COLORS.includes(color as MindMapNodeColor)
          ? (color as MindMapNodeColor)
          : DEFAULT_COLOR,
        root: raw.root === true,
        projectId: str(raw.projectId),
        taskId: str(raw.taskId),
      })
    }
  }

  // Exactly one root. More than one is ambiguous; none leaves the map with no
  // anchor and makes every node deletable, including the last.
  const roots = nodes.filter((n) => n.root)
  if (roots.length !== 1 && nodes.length > 0) {
    for (const n of nodes) n.root = false
    nodes[0].root = true
  }

  const edges: MindMapEdge[] = []
  const edgeSeen = new Set<string>()
  const pairSeen = new Set<string>()
  if (Array.isArray(rawEdges)) {
    for (const raw of rawEdges) {
      if (edges.length >= MAX_MAP_EDGES) break
      if (!isRecord(raw)) continue
      const id = str(raw.id)
      const from = str(raw.from)
      const to = str(raw.to)
      if (!id || !from || !to || from === to) continue
      if (edgeSeen.has(id) || !seen.has(from) || !seen.has(to)) continue
      const pair = from < to ? `${from}|${to}` : `${to}|${from}`
      if (pairSeen.has(pair)) continue
      edgeSeen.add(id)
      pairSeen.add(pair)
      edges.push({ id, from, to })
    }
  }

  return { nodes: nodes.length > 0 ? nodes : emptyGraph().nodes, edges }
}

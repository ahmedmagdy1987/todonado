import { describe, expect, it } from 'vitest'
import type { MindMapGraph } from '@/types/database'
import {
  MAX_MAP_EDGES,
  MAX_MAP_NODES,
  MAX_NODE_NOTE,
  MAX_NODE_TITLE,
  MIN_SCALE,
  MAX_SCALE,
  NODE_H_NOTE,
  NODE_W,
  ROOT_NODE_ID,
  addNode,
  areConnected,
  boundsOf,
  canCreateMindMap,
  clampScale,
  clipToBox,
  connect,
  deleteNode,
  disconnect,
  disconnectBetween,
  emptyGraph,
  fitView,
  moveNode,
  nextNodePosition,
  nodeSize,
  normaliseMap,
  openingView,
  READABLE_SCALE,
  screenToWorld,
  truncate,
  updateNode,
  validateMapTitle,
  validateNode,
  worldToScreen,
  wrapNote,
  zoomAt,
} from './graph'

/** A small map: root + two children, one line. */
function sample(): MindMapGraph {
  let g = emptyGraph('Centre')
  g = addNode(g, { id: 'a', title: 'Idea A', x: 200, y: 0 })
  g = addNode(g, { id: 'b', title: 'Idea B', x: -200, y: 100 })
  g = connect(g, 'e1', ROOT_NODE_ID, 'a')
  return g
}

describe('emptyGraph', () => {
  it('starts with exactly one root node and no lines', () => {
    const g = emptyGraph()
    expect(g.nodes).toHaveLength(1)
    expect(g.nodes[0].root).toBe(true)
    expect(g.nodes[0].id).toBe(ROOT_NODE_ID)
    expect(g.edges).toEqual([])
  })

  it('truncates an over-long root title rather than failing', () => {
    expect(emptyGraph('x'.repeat(500)).nodes[0].title).toHaveLength(MAX_NODE_TITLE)
  })
})

describe('addNode', () => {
  it('appends a node with defaults filled in', () => {
    const g = addNode(emptyGraph(), { id: 'a', title: '  Idea  ', x: 10, y: 20 })
    const n = g.nodes[1]
    expect(n.title).toBe('Idea')
    expect(n.color).toBe('brand')
    expect(n.note).toBeNull()
    expect(n.projectId).toBeNull()
    // A second root would make "the centre" ambiguous — never inherited.
    expect(n.root).toBeUndefined()
  })

  it('refuses a blank title, a duplicate id, and anything past the cap', () => {
    const g = emptyGraph()
    expect(addNode(g, { id: 'a', title: '   ', x: 0, y: 0 })).toBe(g)
    const withA = addNode(g, { id: 'a', title: 'A', x: 0, y: 0 })
    expect(addNode(withA, { id: 'a', title: 'Again', x: 5, y: 5 })).toBe(withA)

    let full = emptyGraph()
    for (let i = full.nodes.length; i < MAX_MAP_NODES; i += 1) {
      full = addNode(full, { id: `n${i}`, title: `n${i}`, x: i, y: 0 })
    }
    expect(full.nodes).toHaveLength(MAX_MAP_NODES)
    // Refused operations return the SAME reference — "did it apply?" is ===.
    expect(addNode(full, { id: 'over', title: 'over', x: 0, y: 0 })).toBe(full)
  })

  it('truncates a long title and note instead of rejecting them', () => {
    const g = addNode(emptyGraph(), {
      id: 'a',
      title: 'x'.repeat(200),
      note: 'y'.repeat(900),
      x: 0,
      y: 0,
    })
    expect(g.nodes[1].title).toHaveLength(MAX_NODE_TITLE)
    expect(g.nodes[1].note).toHaveLength(MAX_NODE_NOTE)
  })
})

describe('updateNode', () => {
  it('patches only what is named', () => {
    const g = updateNode(sample(), 'a', { color: 'success' })
    const n = g.nodes.find((x) => x.id === 'a')!
    expect(n.color).toBe('success')
    expect(n.title).toBe('Idea A')
  })

  it('clears a note when passed an empty string, but keeps it when undefined', () => {
    let g = updateNode(sample(), 'a', { note: 'because' })
    expect(g.nodes.find((x) => x.id === 'a')!.note).toBe('because')
    g = updateNode(g, 'a', { color: 'danger' })
    expect(g.nodes.find((x) => x.id === 'a')!.note).toBe('because')
    g = updateNode(g, 'a', { note: '   ' })
    expect(g.nodes.find((x) => x.id === 'a')!.note).toBeNull()
  })

  it('refuses to blank a node name', () => {
    const g = sample()
    expect(updateNode(g, 'a', { title: '   ' })).toBe(g)
  })

  it('is a no-op for an unknown id', () => {
    const g = sample()
    expect(updateNode(g, 'nope', { color: 'warning' })).toBe(g)
  })

  it('unlinks when passed null', () => {
    let g = updateNode(sample(), 'a', { projectId: 'p1' })
    expect(g.nodes.find((x) => x.id === 'a')!.projectId).toBe('p1')
    g = updateNode(g, 'a', { projectId: null })
    expect(g.nodes.find((x) => x.id === 'a')!.projectId).toBeNull()
  })
})

describe('moveNode', () => {
  it('moves one node and leaves the rest alone', () => {
    const g = moveNode(sample(), 'a', 500, -20)
    expect(g.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 500, y: -20 })
    expect(g.nodes.find((n) => n.id === 'b')).toMatchObject({ x: -200, y: 100 })
  })

  it('returns the same graph for a no-op move, so a drag that does not move does not save', () => {
    const g = sample()
    expect(moveNode(g, 'a', 200, 0)).toBe(g)
  })

  it('ignores non-finite coordinates rather than writing NaN into the map', () => {
    const g = sample()
    expect(moveNode(g, 'a', NaN, 0)).toBe(g)
    expect(moveNode(g, 'a', 0, Infinity)).toBe(g)
  })
})

describe('deleteNode', () => {
  it('removes the node AND every line touching it', () => {
    const g = deleteNode(sample(), 'a')
    expect(g.nodes.map((n) => n.id)).toEqual([ROOT_NODE_ID, 'b'])
    expect(g.edges).toEqual([])
  })

  it('never deletes the root', () => {
    const g = sample()
    expect(deleteNode(g, ROOT_NODE_ID)).toBe(g)
  })

  it('is a no-op for an unknown id', () => {
    const g = sample()
    expect(deleteNode(g, 'ghost')).toBe(g)
  })
})

describe('connect / disconnect', () => {
  it('connects two nodes', () => {
    const g = connect(sample(), 'e2', 'a', 'b')
    expect(g.edges).toHaveLength(2)
    expect(areConnected(g, 'a', 'b')).toBe(true)
  })

  it('refuses a self-loop', () => {
    const g = sample()
    expect(connect(g, 'e2', 'a', 'a')).toBe(g)
  })

  it('refuses a duplicate in EITHER direction — these lines have no direction', () => {
    const g = sample()
    expect(connect(g, 'e2', ROOT_NODE_ID, 'a')).toBe(g)
    expect(connect(g, 'e3', 'a', ROOT_NODE_ID)).toBe(g)
  })

  it('refuses an endpoint that does not exist', () => {
    const g = sample()
    expect(connect(g, 'e2', 'a', 'ghost')).toBe(g)
    expect(connect(g, 'e2', 'ghost', 'a')).toBe(g)
  })

  it('refuses past the edge cap', () => {
    let g = emptyGraph()
    for (let i = 0; i < 40; i += 1) g = addNode(g, { id: `n${i}`, title: `n${i}`, x: i * 10, y: 0 })
    let made = 0
    for (let i = 0; i < 40 && made < MAX_MAP_EDGES; i += 1) {
      for (let j = i + 1; j < 40 && made < MAX_MAP_EDGES; j += 1) {
        const next = connect(g, `e${i}_${j}`, `n${i}`, `n${j}`)
        if (next !== g) made += 1
        g = next
      }
    }
    expect(g.edges).toHaveLength(MAX_MAP_EDGES)
    expect(connect(g, 'over', 'n0', ROOT_NODE_ID)).toBe(g)
  })

  it('disconnects by edge id and by pair, either way round', () => {
    const g = sample()
    expect(disconnect(g, 'e1').edges).toEqual([])
    expect(disconnectBetween(g, 'a', ROOT_NODE_ID).edges).toEqual([])
    expect(disconnect(g, 'nope')).toBe(g)
    expect(disconnectBetween(g, 'a', 'b')).toBe(g)
  })
})

describe('geometry', () => {
  it('makes a node taller when it carries a note', () => {
    expect(nodeSize({ note: null }).h).toBeLessThan(nodeSize({ note: 'why' }).h)
    // Whitespace is not a note.
    expect(nodeSize({ note: '   ' })).toEqual(nodeSize({ note: null }))
  })

  it('clips a line to the edge of the target box, not its centre', () => {
    const p = clipToBox({ x: 0, y: 0 }, { x: 400, y: 0 }, { w: 100, h: 40 })
    expect(p).toEqual({ x: 350, y: 0 })
  })

  it('survives two nodes dropped exactly on top of each other', () => {
    const p = clipToBox({ x: 10, y: 10 }, { x: 10, y: 10 }, { w: 100, h: 40 })
    expect(p).toEqual({ x: 10, y: 10 })
    expect(Number.isNaN(p.x)).toBe(false)
  })

  it('bounds include each node BOX, not just its centre', () => {
    const b = boundsOf(emptyGraph().nodes)!
    expect(b.minX).toBe(-NODE_W / 2)
    expect(b.maxX).toBe(NODE_W / 2)
    expect(boundsOf([])).toBeNull()
  })
})

describe('camera', () => {
  it('round-trips screen and world coordinates', () => {
    const view = { scale: 1.7, tx: 33, ty: -12 }
    const world = { x: 120, y: -80 }
    const back = screenToWorld(worldToScreen(world, view), view)
    expect(back.x).toBeCloseTo(world.x, 10)
    expect(back.y).toBeCloseTo(world.y, 10)
  })

  it('clamps scale into range and survives garbage', () => {
    expect(clampScale(99)).toBe(MAX_SCALE)
    expect(clampScale(0.0001)).toBe(MIN_SCALE)
    expect(clampScale(NaN)).toBe(1)
  })

  it('zooms around the anchor: the world point under the cursor does not move', () => {
    const view = { scale: 1, tx: 0, ty: 0 }
    const anchor = { x: 300, y: 200 }
    const before = screenToWorld(anchor, view)
    const after = zoomAt(view, 1.4, anchor)
    const still = screenToWorld(anchor, after)
    expect(still.x).toBeCloseTo(before.x, 6)
    expect(still.y).toBeCloseTo(before.y, 6)
  })

  it('does not drift sideways when the zoom is clamped away', () => {
    // Already at max: the factor cannot apply, so nothing at all may move.
    const view = { scale: MAX_SCALE, tx: 40, ty: 40 }
    expect(zoomAt(view, 2, { x: 300, y: 300 })).toEqual(view)
  })

  it('fits the graph into the viewport and centres it', () => {
    const g = sample()
    const viewport = { w: 800, h: 600 }
    const view = fitView(boundsOf(g.nodes), viewport)
    const centres = g.nodes.map((n) => worldToScreen(n, view))
    for (const c of centres) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x).toBeLessThanOrEqual(viewport.w)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeLessThanOrEqual(viewport.h)
    }
  })

  it('never zooms IN to fit — a two-node map must not fill a desktop screen', () => {
    expect(fitView(boundsOf(emptyGraph().nodes), { w: 1600, h: 1200 }).scale).toBe(1)
  })

  it('opens FITTED when that is still readable', () => {
    const g = sample()
    const viewport = { w: 1200, h: 800 }
    expect(openingView(g.nodes, viewport)).toEqual(fitView(boundsOf(g.nodes), viewport))
  })

  it('opens at the readable floor, centred on the ROOT, when fitting would be a smudge', () => {
    // A wide map on a 390px phone: fitting lands around 35%, where every label is
    // unreadable and the first thing the user must do is zoom back in.
    let g = emptyGraph('Centre')
    for (let i = 0; i < 10; i += 1) {
      g = addNode(g, { id: `n${i}`, title: `n${i}`, x: i * 400 - 2000, y: (i % 3) * 300 })
    }
    const viewport = { w: 358, h: 480 }
    expect(fitView(boundsOf(g.nodes), viewport).scale).toBeLessThan(READABLE_SCALE)

    const opening = openingView(g.nodes, viewport)
    expect(opening.scale).toBe(READABLE_SCALE)
    // The root sits in the middle of the screen.
    const root = g.nodes.find((n) => n.root)!
    const onScreen = worldToScreen(root, opening)
    expect(onScreen.x).toBeCloseTo(viewport.w / 2, 6)
    expect(onScreen.y).toBeCloseTo(viewport.h / 2, 6)
  })

  it('trims the fit padding on a narrow viewport rather than paying it in scale', () => {
    // 48px each side of a 358px screen is a quarter of the display.
    const g = sample()
    const narrow = fitView(boundsOf(g.nodes), { w: 358, h: 480 })
    const withFullPad = fitView(boundsOf(g.nodes), { w: 358, h: 480 }, 0)
    expect(narrow.scale).toBeGreaterThan(0)
    expect(narrow.scale).toBeLessThanOrEqual(withFullPad.scale)
  })

  it('returns the identity camera for an empty map or an unmeasured viewport', () => {
    expect(fitView(null, { w: 800, h: 600 })).toEqual({ scale: 1, tx: 0, ty: 0 })
    expect(fitView({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { w: 0, h: 0 })).toEqual({
      scale: 1,
      tx: 0,
      ty: 0,
    })
  })
})

describe('nextNodePosition', () => {
  it('is deterministic', () => {
    const g = sample()
    expect(nextNodePosition(g.nodes)).toEqual(nextNodePosition(g.nodes))
  })

  it('never lands on top of an existing node', () => {
    // Asserted against the REAL box (widest × tallest), not the placement
    // function's own threshold — otherwise this only proves it agrees with
    // itself, which is exactly how the first version drew overlapping boxes
    // while passing.
    let g = emptyGraph()
    for (let i = 0; i < 24; i += 1) {
      const p = nextNodePosition(g.nodes)
      const clash = g.nodes.some(
        (n) => Math.abs(n.x - p.x) < NODE_W && Math.abs(n.y - p.y) < NODE_H_NOTE,
      )
      expect(clash, `node ${i} overlapped`).toBe(false)
      g = addNode(g, { id: `n${i}`, title: `n${i}`, note: 'a note makes it taller', ...p })
    }
  })
})

describe('text fitting — SVG neither wraps nor ellipsises', () => {
  it('leaves a short string alone and ellipsises a long one', () => {
    expect(truncate('short', 20)).toBe('short')
    expect(truncate('abcdefghij', 5)).toBe('abcd…')
    expect(truncate('anything', 0)).toBe('')
  })

  it('wraps a note on word boundaries', () => {
    expect(wrapNote('the quick brown fox jumps', 10, 3)).toEqual(['the quick', 'brown fox', 'jumps'])
  })

  it('marks the last line when it had to drop words', () => {
    const lines = wrapNote('one two three four five six seven eight nine ten', 9, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
  })

  it('hard-cuts a single word longer than the line rather than overflowing', () => {
    const lines = wrapNote('supercalifragilistic', 8, 2)
    expect(lines[0]).toHaveLength(8)
    expect(lines[0].endsWith('…')).toBe(true)
  })

  it('returns nothing for an empty or whitespace note', () => {
    expect(wrapNote('', 10, 2)).toEqual([])
    expect(wrapNote('   ', 10, 2)).toEqual([])
  })
})

describe('validation and caps', () => {
  it('validates a map title', () => {
    expect(validateMapTitle('  ')).toEqual({ ok: false, error: 'Give the map a name.' })
    expect(validateMapTitle('x'.repeat(81)).ok).toBe(false)
    expect(validateMapTitle('Launch plan')).toEqual({ ok: true })
  })

  it('validates a node', () => {
    expect(validateNode({ title: '', note: null }).ok).toBe(false)
    expect(validateNode({ title: 'x'.repeat(61), note: null }).ok).toBe(false)
    expect(validateNode({ title: 'ok', note: 'y'.repeat(241) }).ok).toBe(false)
    expect(validateNode({ title: 'ok', note: null })).toEqual({ ok: true })
  })

  it('gates CREATION only, and never gates Pro', () => {
    expect(canCreateMindMap(0, false, 1)).toBe(true)
    expect(canCreateMindMap(1, false, 1)).toBe(false)
    // Pro is unlimited even sitting on a pile of maps.
    expect(canCreateMindMap(99, true, 1)).toBe(true)
  })
})

describe('normaliseMap — a jsonb column the database cannot fully constrain', () => {
  it('reads a well-formed graph unchanged', () => {
    const g = sample()
    const out = normaliseMap(g.nodes, g.edges)
    expect(out.nodes.map((n) => n.id)).toEqual([ROOT_NODE_ID, 'a', 'b'])
    expect(out.edges).toEqual(g.edges)
  })

  it('drops junk nodes instead of throwing', () => {
    const out = normaliseMap(
      [
        { id: 'ok', title: 'Fine', x: 0, y: 0, root: true },
        null,
        'nope',
        { id: 'no-title', x: 1, y: 1 },
        { id: 'nan', title: 'NaN', x: 'x', y: 2 },
        { title: 'no id', x: 1, y: 1 },
      ],
      [],
    )
    expect(out.nodes.map((n) => n.id)).toEqual(['ok'])
  })

  it('drops duplicate node ids, keeping the first', () => {
    const out = normaliseMap(
      [
        { id: 'a', title: 'First', x: 0, y: 0, root: true },
        { id: 'a', title: 'Second', x: 9, y: 9 },
      ],
      [],
    )
    expect(out.nodes).toHaveLength(1)
    expect(out.nodes[0].title).toBe('First')
  })

  it('drops an edge whose endpoint is missing — no line to nowhere', () => {
    const out = normaliseMap(
      [{ id: 'a', title: 'A', x: 0, y: 0, root: true }],
      [
        { id: 'e', from: 'a', to: 'ghost' },
        { id: 'e2', from: 'ghost', to: 'a' },
      ],
    )
    expect(out.edges).toEqual([])
  })

  it('drops duplicate lines between the same pair, in either direction', () => {
    const out = normaliseMap(
      [
        { id: 'a', title: 'A', x: 0, y: 0, root: true },
        { id: 'b', title: 'B', x: 10, y: 0 },
      ],
      [
        { id: 'e1', from: 'a', to: 'b' },
        { id: 'e2', from: 'b', to: 'a' },
        { id: 'e3', from: 'a', to: 'a' },
      ],
    )
    expect(out.edges).toHaveLength(1)
    expect(out.edges[0].id).toBe('e1')
  })

  it('forces exactly one root, whatever the row claimed', () => {
    const none = normaliseMap(
      [
        { id: 'a', title: 'A', x: 0, y: 0 },
        { id: 'b', title: 'B', x: 1, y: 1 },
      ],
      [],
    )
    expect(none.nodes.filter((n) => n.root)).toHaveLength(1)

    const many = normaliseMap(
      [
        { id: 'a', title: 'A', x: 0, y: 0, root: true },
        { id: 'b', title: 'B', x: 1, y: 1, root: true },
      ],
      [],
    )
    expect(many.nodes.filter((n) => n.root)).toHaveLength(1)
  })

  it('falls back to an unknown colour rather than emitting a raw value', () => {
    const out = normaliseMap([{ id: 'a', title: 'A', x: 0, y: 0, color: '#ff0000' }], [])
    expect(out.nodes[0].color).toBe('brand')
  })

  it('enforces the caps on the way IN, so an oversized row cannot be re-saved', () => {
    const many = Array.from({ length: MAX_MAP_NODES + 50 }, (_, i) => ({
      id: `n${i}`,
      title: `n${i}`,
      x: i,
      y: 0,
    }))
    expect(normaliseMap(many, []).nodes).toHaveLength(MAX_MAP_NODES)
  })

  it('returns a usable map for null / a non-array / an empty array', () => {
    for (const raw of [null, undefined, {}, 'text', 42, []]) {
      const out = normaliseMap(raw, raw)
      expect(out.nodes).toHaveLength(1)
      expect(out.nodes[0].root).toBe(true)
      expect(out.edges).toEqual([])
    }
  })
})

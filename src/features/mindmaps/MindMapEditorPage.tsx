import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  CloudOff,
  Link2,
  Maximize2,
  Pencil,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button, Card, CardContent, Input } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useProjects } from '@/features/projects/api/useProjects'
import { useTasks } from '@/features/tasks/api/useTasks'
import { cn } from '@/lib/utils'
import type { MindMapGraph, MindMapNode } from '@/types/database'
import {
  IDENTITY_VIEW,
  MAX_MAP_NODES,
  MAX_MAP_TITLE,
  type MapView,
  addNode,
  boundsOf,
  clampScale,
  connect,
  deleteNode,
  disconnectBetween,
  emptyGraph,
  fitView,
  openingView,
  areConnected,
  moveNode,
  nextNodePosition,
  normaliseMap,
  screenToWorld,
  updateNode,
  zoomAt,
} from './graph'
import {
  persistMindMap,
  persistMindMapKeepalive,
  useMindMap,
  useMindMapMutations,
} from './api/useMindMaps'
import { MapCanvas, type CanvasMode } from './components/MapCanvas'
import { NodeDialog, type NodeDraft } from './components/NodeDialog'

/** How long after the last change the map is written. */
const AUTOSAVE_MS = 900

/**
 * The map editor.
 *
 * THE COMPONENT OWNS THE GRAPH WHILE IT IS OPEN, and the server is written to
 * behind it. That is the opposite of how most of this app works (TanStack Query
 * owns server state) and it is deliberate: a drag produces changes faster than
 * any round trip, so a query-owned graph would either flicker back to the last
 * saved state or need an optimistic update per pointer move. The single-map
 * query is therefore configured `staleTime: Infinity` with no refetch on focus —
 * see the hook — and this component seeds itself from it exactly once.
 *
 * SAVING IS DEBOUNCED, AND FLUSHED ON THE WAYS OUT THAT ACTUALLY HAPPEN:
 * navigating away (unmount) and the tab being hidden — which on a phone is what
 * "closed the app" looks like. `beforeunload` is deliberately NOT used: it
 * cannot await an async write, and the confirm dialog it is usually paired with
 * would be a worse experience than a 900ms window.
 */
export function MindMapEditorPage() {
  const { mapId = '' } = useParams()
  const { user, session } = useAuth()
  const userId = user?.id ?? ''
  const navigate = useNavigate()
  const { workspaceId } = useWorkspace()
  const { data: projects = [] } = useProjects(workspaceId)
  const { data: allTasks = [] } = useTasks(workspaceId)

  const { data, isPending } = useMindMap(mapId)
  const { saveMap, deleteMap } = useMindMapMutations(userId)

  const [graph, setGraph] = useState<MindMapGraph>(() => emptyGraph())
  const [title, setTitle] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<MapView>(IDENTITY_VIEW)
  const [mode, setMode] = useState<CanvasMode>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [dialogFor, setDialogFor] = useState<{ node: MindMapNode | null } | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const hostRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })

  // ---- seed once from the server ------------------------------------------
  const map = data?.map ?? null
  const available = data?.available ?? true
  useEffect(() => {
    if (loaded || !map) return
    setGraph(normaliseMap(map.nodes, map.edges))
    setTitle(map.title)
    setLoaded(true)
  }, [map, loaded])

  // ---- autosave ------------------------------------------------------------
  const latest = useRef<MindMapGraph>(graph)
  latest.current = graph
  const dirty = useRef(false)
  const timer = useRef(0)

  const writeNow = useCallback(() => {
    window.clearTimeout(timer.current)
    if (!dirty.current || !mapId) return
    dirty.current = false
    setSaveState('saving')
    saveMap.mutate(
      { id: mapId, patch: { nodes: latest.current.nodes, edges: latest.current.edges } },
      { onSuccess: () => setSaveState('saved'), onError: () => setSaveState('error') },
    )
  }, [mapId, saveMap])

  const touch = useCallback(() => {
    dirty.current = true
    setSaveState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(writeNow, AUTOSAVE_MS)
  }, [writeNow])

  /** Flush without React — used on unmount and on tab-hide. See the header. */
  const flushDetached = useCallback(() => {
    window.clearTimeout(timer.current)
    if (!dirty.current || !mapId) return
    dirty.current = false
    void persistMindMap(mapId, {
      nodes: latest.current.nodes,
      edges: latest.current.edges,
    }).catch(() => {
      /* nothing left to tell, and re-throwing here would be an unhandled rejection */
    })
  }, [mapId])

  /**
   * The one flush that must outlive the document. `pagehide` is the event that
   * actually fires on a reload, a back-navigation and a closed tab — the three
   * cases where the debounce timer never runs AND any request already in flight
   * is cancelled with it.
   */
  const tokenRef = useRef<string | null>(null)
  tokenRef.current = session?.access_token ?? null

  useEffect(() => {
    const onLeave = () => {
      window.clearTimeout(timer.current)
      if (!dirty.current || !mapId) return
      const patch = { nodes: latest.current.nodes, edges: latest.current.edges }
      const token = tokenRef.current
      // Try the request that survives unload; if there is no token, or the map
      // is too big for keepalive, fall back to the ordinary one — which at least
      // wins the race when the tab is merely being backgrounded.
      if (!token || !persistMindMapKeepalive(mapId, patch, token)) {
        void persistMindMap(mapId, patch).catch(() => {})
      }
      dirty.current = false
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushDetached()
    }
    window.addEventListener('pagehide', onLeave)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onLeave)
      document.removeEventListener('visibilitychange', onHide)
      flushDetached()
    }
  }, [flushDetached, mapId])

  // ---- viewport measurement + first fit ------------------------------------
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loaded])

  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !loaded || viewport.w === 0) return
    fitted.current = true
    setView(openingView(latest.current.nodes, viewport))
  }, [loaded, viewport])

  // ---- graph edits ---------------------------------------------------------
  const apply = useCallback(
    (next: MindMapGraph) => {
      setGraph((prev) => {
        // Every graph op returns the SAME reference when it refused, so this is
        // how a rejected edit avoids scheduling a pointless save.
        if (next === prev) return prev
        touch()
        return next
      })
    },
    [touch],
  )

  /** Ids are only ever unique within one map, so a short random one is enough. */
  const newId = () => Math.random().toString(36).slice(2, 10)

  function addIdea() {
    if (graph.nodes.length >= MAX_MAP_NODES) return
    setDialogFor({ node: null })
  }

  /**
   * The node is created HERE, on save, not when "Add idea" was pressed.
   * Creating it up front and filling it in afterwards is simpler to write and
   * leaves a stray "New idea" box on the canvas every time someone opens the
   * dialog and changes their mind.
   */
  function saveNode(draft: NodeDraft) {
    const target = dialogFor?.node
    if (target) {
      apply(updateNode(graph, target.id, draft))
      return
    }
    // Place it near the middle of what the user is actually LOOKING at, so a new
    // idea never lands off-screen on a map that has been panned away.
    const centre =
      viewport.w > 0 ? screenToWorld({ x: viewport.w / 2, y: viewport.h / 2 }, view) : { x: 0, y: 0 }
    const at = nextNodePosition(graph.nodes, centre)
    const id = newId()
    apply(
      addNode(graph, {
        id,
        title: draft.title,
        note: draft.note,
        color: draft.color,
        projectId: draft.projectId,
        taskId: draft.taskId,
        ...at,
      }),
    )
    setSelectedId(id)
  }

  function activate(id: string) {
    if (mode !== 'connect') {
      setSelectedId(id)
      return
    }
    if (!connectFrom) {
      setConnectFrom(id)
      return
    }
    if (connectFrom === id) {
      setConnectFrom(null)
      return
    }
    // Tapping an already-connected pair REMOVES the line. One gesture for both
    // directions beats a separate "disconnect" mode nobody would find.
    apply(
      areConnected(graph, connectFrom, id)
        ? disconnectBetween(graph, connectFrom, id)
        : connect(graph, newId(), connectFrom, id),
    )
    setConnectFrom(null)
  }

  function removeNode(id: string) {
    apply(deleteNode(graph, id))
    setSelectedId((s) => (s === id ? null : s))
    setConnectFrom((c) => (c === id ? null : c))
  }

  function commitTitle() {
    const next = title.trim().slice(0, MAX_MAP_TITLE)
    if (!next || !map || next === map.title) {
      setTitle(map?.title ?? '')
      return
    }
    saveMap.mutate({ id: mapId, patch: { title: next } })
  }

  const openTasks = useMemo(
    () => allTasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled').slice(0, 200),
    [allTasks],
  )

  if (!isPending && (!available || !map)) {
    return (
      <div className="animate-fade-in space-y-6">
        <BackLink />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <h3 className="font-display text-lg font-semibold">
              {available ? 'Map not found' : 'Not switched on yet'}
            </h3>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-text-muted">
              {available
                ? 'It may have been deleted. Everything else is where you left it.'
                : 'Mind maps are built and waiting on a database migration. This page will start working the moment it is applied.'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <BackLink />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Map name</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            maxLength={MAX_MAP_TITLE}
            placeholder="Untitled map"
            className="font-display text-base font-semibold"
          />
        </label>
        <SaveBadge state={saveState} />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete this map"
          onClick={() => {
            deleteMap.mutate(mapId)
            navigate('/vision/maps')
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {/* Toolbar. Every control here has a keyboard-reachable twin in the list
          below, so nothing depends on being able to point at the canvas. */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Map tools">
        <Button size="sm" onClick={addIdea} disabled={graph.nodes.length >= MAX_MAP_NODES}>
          <Plus className="h-4 w-4" aria-hidden /> Add idea
        </Button>
        <Button
          size="sm"
          variant={mode === 'connect' ? 'primary' : 'outline'}
          aria-pressed={mode === 'connect'}
          onClick={() => {
            setMode((m) => (m === 'connect' ? 'select' : 'connect'))
            setConnectFrom(null)
          }}
        >
          <Link2 className="h-4 w-4" aria-hidden /> Connect
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            onClick={() => setView((v) => zoomAt(v, 0.8, { x: viewport.w / 2, y: viewport.h / 2 }))}
          >
            <ZoomOut className="h-4 w-4" aria-hidden />
          </Button>
          <span className="w-12 text-center font-mono text-xs tabular-nums text-text-muted">
            {Math.round(clampScale(view.scale) * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            onClick={() => setView((v) => zoomAt(v, 1.25, { x: viewport.w / 2, y: viewport.h / 2 }))}
          >
            <ZoomIn className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setView(fitView(boundsOf(graph.nodes), viewport))}
          >
            <Maximize2 className="h-4 w-4" aria-hidden /> Fit
          </Button>
        </div>
      </div>

      {mode === 'connect' && (
        <p role="status" className="text-xs text-accent">
          {connectFrom
            ? 'Now pick the idea to join it to. Picking one that is already joined removes the line.'
            : 'Pick two ideas to join them.'}
        </p>
      )}

      <div ref={hostRef} className="h-[58vh] min-h-[320px] w-full sm:h-[62vh]">
        {isPending ? (
          <div className="h-full w-full animate-pulse rounded-2xl border border-white/5 bg-surface-2/40" />
        ) : (
          <MapCanvas
            className="h-full w-full"
            graph={graph}
            view={view}
            onViewChange={setView}
            selectedId={selectedId}
            onSelect={setSelectedId}
            connectFrom={connectFrom}
            mode={mode}
            onActivate={activate}
            onNodeMove={(id, x, y) => apply(moveNode(graph, id, x, y))}
            onNodeMoveEnd={writeNow}
            onEdit={(id) => {
              const node = graph.nodes.find((n) => n.id === id) ?? null
              setSelectedId(id)
              setDialogFor({ node })
            }}
            onDelete={removeNode}
          />
        )}
      </div>

      <NodeList
        graph={graph}
        selectedId={selectedId}
        projects={projects}
        tasks={allTasks}
        onEdit={(node) => {
          setSelectedId(node.id)
          setDialogFor({ node })
        }}
        onDelete={removeNode}
        onFocus={setSelectedId}
      />

      <NodeDialog
        open={!!dialogFor}
        onClose={() => setDialogFor(null)}
        node={dialogFor?.node}
        projects={projects}
        tasks={openTasks}
        onSave={saveNode}
      />
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/vision/maps"
      className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-text-muted hover:text-text-primary md:min-h-0"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> Maps
    </Link>
  )
}

function SaveBadge({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null
  const map = {
    saving: { text: 'Saving…', cls: 'text-text-muted', icon: null },
    saved: { text: 'Saved', cls: 'text-success', icon: Check },
    error: { text: "Couldn't save", cls: 'text-danger', icon: CloudOff },
  }[state]
  const Icon = map.icon
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex items-center gap-1.5 font-mono text-xs', map.cls)}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {map.text}
    </span>
  )
}

/**
 * The same map, as a list.
 *
 * This is not a fallback — it is the accessible surface for a feature that is
 * otherwise a drag-and-drop canvas. Every idea can be reached, edited, opened
 * and deleted from here with a keyboard alone, and a screen reader gets a plain
 * list rather than a pile of SVG. It also happens to be the fastest way to find
 * one node on a big map.
 */
function NodeList({
  graph,
  selectedId,
  projects,
  tasks,
  onEdit,
  onDelete,
  onFocus,
}: {
  graph: MindMapGraph
  selectedId: string | null
  projects: { id: string; name: string }[]
  tasks: { id: string; title: string }[]
  onEdit: (node: MindMapNode) => void
  onDelete: (id: string) => void
  onFocus: (id: string) => void
}) {
  const degree = useMemo(() => {
    const d = new Map<string, number>()
    for (const e of graph.edges) {
      d.set(e.from, (d.get(e.from) ?? 0) + 1)
      d.set(e.to, (d.get(e.to) ?? 0) + 1)
    }
    return d
  }, [graph.edges])

  return (
    <section aria-labelledby="mm-ideas" className="rounded-2xl border border-white/5 bg-surface/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="mm-ideas" className="font-display text-sm font-semibold">
          Ideas
        </h3>
        <p className="font-mono text-[11px] text-text-muted">
          {graph.nodes.length} of {MAX_MAP_NODES} · {graph.edges.length} link
          {graph.edges.length === 1 ? '' : 's'}
        </p>
      </div>

      <ul className="mt-3 divide-y divide-white/5">
        {graph.nodes.map((node) => {
          const project = node.projectId ? projects.find((p) => p.id === node.projectId) : null
          const task = node.taskId ? tasks.find((t) => t.id === node.taskId) : null
          return (
            <li
              key={node.id}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1 py-2',
                node.id === selectedId && 'rounded-lg bg-surface-2/40',
              )}
            >
              <button
                type="button"
                onClick={() => onFocus(node.id)}
                className="focus-ring min-w-0 flex-1 rounded px-1 text-left"
              >
                <span className="truncate text-sm font-medium text-text-primary">{node.title}</span>
                {node.root && <span className="ml-2 text-[11px] text-text-muted">centre</span>}
                {node.note && (
                  <span className="ml-2 truncate text-xs text-text-muted">{node.note}</span>
                )}
              </button>

              <span className="font-mono text-[11px] text-text-muted">
                {degree.get(node.id) ?? 0} link{(degree.get(node.id) ?? 0) === 1 ? '' : 's'}
              </span>

              {project && (
                <Link
                  to={`/projects/${project.id}`}
                  className="focus-ring rounded-lg border border-accent/25 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/10"
                >
                  {project.name}
                </Link>
              )}
              {task && (
                <Link
                  to={`/focus?task=${task.id}`}
                  className="focus-ring rounded-lg border border-accent/25 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/10"
                >
                  {task.title}
                </Link>
              )}

              <button
                type="button"
                onClick={() => onEdit(node)}
                aria-label={`Edit ${node.title}`}
                className="tap-44 focus-ring rounded-lg p-1.5 text-text-muted hover:text-text-primary"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
              {!node.root && (
                <button
                  type="button"
                  onClick={() => onDelete(node.id)}
                  aria-label={`Delete ${node.title}`}
                  className="tap-44 focus-ring rounded-lg p-1.5 text-text-muted hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

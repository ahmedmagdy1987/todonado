import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import { qk } from '@/lib/queryKeys'
import type { MindMap, MindMapPatch, NewMindMapInput } from '@/types/database'
import { assertRealIds } from '@/lib/optimistic'

/** PostgREST / Postgres codes for "that table isn't there". */
const TABLE_MISSING = new Set(['PGRST205', '42P01'])

/** The list. Titles and timestamps only — the graph columns are big. */
const LIST_COLUMNS = 'id,user_id,title,created_at,updated_at'

export type MindMapSummary = Omit<MindMap, 'nodes' | 'edges'>

/**
 * Owner-only mind maps (RLS: user_id = auth.uid()).
 *
 * DEGRADES GRACEFULLY WHEN THE TABLE IS ABSENT, the same posture as
 * `useVisionCards` / `useQuitHabits`: the migration ships committed but
 * unapplied, so until `supabase db push` runs this returns [] and marks itself
 * unavailable, and the page shows an honest "not switched on yet" state instead
 * of an Add button that could only ever fail.
 */
export function useMindMaps(userId: string) {
  return useQuery({
    queryKey: qk.mindMaps(userId),
    enabled: !!userId,
    retry: false,
    queryFn: async (): Promise<{ rows: MindMapSummary[]; available: boolean }> => {
      const { data, error } = await supabase
        .from('mind_maps')
        .select(LIST_COLUMNS)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
      if (error) {
        // Migration not applied ⇒ unavailable. Any OTHER error is transient:
        // stay available so a blip doesn't hide someone's maps behind a
        // "not switched on" card that is simply wrong.
        return { rows: [], available: !TABLE_MISSING.has(error.code) }
      }
      return { rows: (data ?? []) as MindMapSummary[], available: true }
    },
  })
}

/**
 * ONE map, with its graph.
 *
 * `staleTime: Infinity` and no refetch on focus — deliberately. The editor holds
 * the authoritative copy while it is open and writes to it constantly; a
 * background refetch landing mid-edit would replace what the user is dragging
 * with whatever the server last heard, which reads as work being undone.
 * Invalidation still happens explicitly after a save settles.
 */
export function useMindMap(mapId: string | undefined) {
  return useQuery({
    queryKey: qk.mindMap(mapId ?? ''),
    enabled: !!mapId,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<{ map: MindMap | null; available: boolean }> => {
      const { data, error } = await supabase
        .from('mind_maps')
        .select('*')
        .eq('id', mapId!)
        .maybeSingle()
      if (error) return { map: null, available: !TABLE_MISSING.has(error.code) }
      return { map: (data as MindMap | null) ?? null, available: true }
    },
  })
}

/**
 * A save with NO React attached.
 *
 * The editor flushes pending work when it unmounts and when the tab is hidden —
 * both moments where a `useMutation` is a bad tool: its observer is being torn
 * down, so whether the callbacks still run is a framework detail rather than
 * something worth betting a user's canvas on. This is a plain promise; the
 * caller catches it and there is no one left to show an error to anyway.
 */
export async function persistMindMap(id: string, patch: MindMapPatch): Promise<void> {
  assertRealIds(patch)
  const { error } = await supabase.from('mind_maps').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * `fetch` bodies over ~64 kB are refused with `keepalive`. Our jsonb columns are
 * capped at 64 kB EACH, so a maxed-out map genuinely can exceed it; that case
 * falls back to an ordinary write, which is what would have happened anyway.
 */
const KEEPALIVE_LIMIT = 60_000

/**
 * The save that survives the page going away.
 *
 * SPA navigation is covered by the unmount flush, but a RELOAD or a closed tab
 * kills both the debounce timer and any request already in flight — so the last
 * few seconds of dragging are simply lost, and the user has no way to know. The
 * only thing a browser guarantees will outlive the document is a `keepalive`
 * request, and unlike `sendBeacon` it can carry the Authorization header
 * PostgREST needs.
 *
 * Deliberately fire-and-forget: nothing can be awaited at this point, and there
 * is no UI left to report to.
 */
export function persistMindMapKeepalive(
  id: string,
  patch: MindMapPatch,
  accessToken: string,
): boolean {
  const body = JSON.stringify(patch)
  if (body.length > KEEPALIVE_LIMIT) return false
  try {
    // Encoded, because this is the one write in the app that builds a
    // PostgREST query string by concatenation rather than through the client.
    // `id` arrives from a route parameter.
    void fetch(`${env.VITE_SUPABASE_URL}/rest/v1/mind_maps?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body,
    }).catch(() => {
      /* the document is going away; there is no one to tell */
    })
    return true
  } catch {
    return false
  }
}

export function useMindMapMutations(userId: string) {
  const qc = useQueryClient()
  const listKey = qk.mindMaps(userId)

  type ListCache = { rows: MindMapSummary[]; available: boolean }

  const settleList = () => void qc.invalidateQueries({ queryKey: listKey })

  /**
   * Create a map.
   *
   * DELIBERATELY NOT OPTIMISTIC, for the reason `createCard` and `createHabit`
   * document: the caller navigates straight to /vision/maps/<id>, so a temporary
   * id would put a synthetic `optimistic-…` in the URL and every subsequent save
   * would address a uuid column with a string that is not one. Awaiting the
   * insert means the id in the address bar is always the real one.
   */
  const createMap = useMutation({
    mutationFn: async (input: NewMindMapInput) => {
      assertRealIds(input)
      const { data, error } = await supabase
        .from('mind_maps')
        .insert({
          user_id: userId,
          title: input.title,
          nodes: input.nodes,
          edges: input.edges,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as MindMap
    },
    onSuccess: (row) => {
      // Seed the single-map cache so the editor opens with no second round trip.
      qc.setQueryData(qk.mindMap(row.id), { map: row, available: true })
      qc.setQueryData<ListCache>(listKey, (p) => ({
        available: p?.available ?? true,
        rows: [summarise(row), ...(p?.rows ?? []).filter((m) => m.id !== row.id)],
      }))
    },
    onSettled: settleList,
    // Non-idempotent insert: don't offer a one-click Retry (could double-insert).
    meta: { noRetry: true },
  })

  /**
   * Save. This is the autosave path as well as the rename path, so it runs often
   * and must be cheap: it writes only the columns it was given.
   *
   * The single-map cache is updated OPTIMISTICALLY and never rolled back to a
   * server copy on success — the editor is the source of truth while it is open,
   * and by the time a response arrives the user has usually dragged something
   * else. On FAILURE the caller is told (isError), and nothing is reverted:
   * silently rewinding someone's canvas to a state they can't see would be worse
   * than leaving their work on screen and saying the save failed.
   */
  const saveMap = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MindMapPatch }) => {
      // Guards the FKs a PATCH can carry, not just the row it addresses.
      assertRealIds(patch)
      const { data, error } = await supabase
        .from('mind_maps')
        .update(patch)
        .eq('id', id)
        .select(LIST_COLUMNS)
        .single()
      if (error) throw error
      return data as MindMapSummary
    },
    onMutate: ({ id, patch }) => {
      if (patch.title !== undefined) {
        qc.setQueryData<ListCache>(listKey, (p) =>
          p ? { ...p, rows: p.rows.map((m) => (m.id === id ? { ...m, title: patch.title! } : m)) } : p,
        )
      }
    },
    onSuccess: (row) => {
      qc.setQueryData<ListCache>(listKey, (p) =>
        p ? { ...p, rows: p.rows.map((m) => (m.id === row.id ? row : m)) } : p,
      )
    },
  })

  const deleteMap = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mind_maps').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: listKey })
      const prev = qc.getQueryData<ListCache>(listKey)
      qc.setQueryData<ListCache>(listKey, (p) =>
        p ? { ...p, rows: p.rows.filter((m) => m.id !== id) } : p,
      )
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(listKey, ctx.prev)
    },
    onSuccess: (id) => qc.removeQueries({ queryKey: qk.mindMap(id) }),
    onSettled: settleList,
  })

  return { createMap, saveMap, deleteMap }
}

function summarise(row: MindMap): MindMapSummary {
  const { id, user_id, title, created_at, updated_at } = row
  return { id, user_id, title, created_at, updated_at }
}

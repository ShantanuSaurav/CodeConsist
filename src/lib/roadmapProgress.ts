import { useCallback, useEffect, useState } from 'react';
import type { Roadmap, RoadmapNodeStatus } from '../types';
import { readJson, writeJson } from './storage';
import { roadmapNodeIds } from '../data/roadmaps';

/**
 * Per-node roadmap status (pending / learning / done / skipped), kept in this
 * browser the way roadmap.sh keeps it. Independent of challenge progress:
 * marking a topic done is the learner's own judgement, not something the
 * server verifies, so it never earns XP.
 */
const KEY = 'cq-roadmap-progress-v1';
const EVENT = 'cq-roadmap-progress';

type Store = Record<string, Record<string, RoadmapNodeStatus>>;

function read(): Store {
  return readJson<Store>(KEY, {});
}

function write(store: Store) {
  writeJson(KEY, store);
  window.dispatchEvent(new Event(EVENT));
}

export function nodeStatus(slug: string, nodeId: string): RoadmapNodeStatus {
  return read()[slug]?.[nodeId] ?? 'pending';
}

export function setNodeStatus(slug: string, nodeId: string, status: RoadmapNodeStatus) {
  const store = read();
  const map = { ...(store[slug] ?? {}) };
  if (status === 'pending') delete map[nodeId];
  else map[nodeId] = status;
  store[slug] = map;
  write(store);
}

export interface RoadmapSummary {
  done: number;
  learning: number;
  skipped: number;
  total: number;
  /** done ÷ (total − skipped), like roadmap.sh's progress bar. */
  percent: number;
}

export function summarise(roadmap: Roadmap, statuses: Record<string, RoadmapNodeStatus>): RoadmapSummary {
  const ids = roadmapNodeIds(roadmap);
  let done = 0,
    learning = 0,
    skipped = 0;
  for (const id of ids) {
    const s = statuses[id];
    if (s === 'done') done++;
    else if (s === 'learning') learning++;
    else if (s === 'skipped') skipped++;
  }
  const counted = Math.max(1, ids.length - skipped);
  return { done, learning, skipped, total: ids.length, percent: Math.round((done / counted) * 100) };
}

/** Live view of one roadmap's statuses; re-renders on any change in this tab. */
export function useRoadmapProgress(slug: string) {
  const [statuses, setStatuses] = useState<Record<string, RoadmapNodeStatus>>(() => read()[slug] ?? {});

  useEffect(() => {
    const sync = () => setStatuses(read()[slug] ?? {});
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [slug]);

  const set = useCallback((nodeId: string, status: RoadmapNodeStatus) => setNodeStatus(slug, nodeId, status), [slug]);

  return { statuses, set };
}

/** All roadmaps' statuses, for the hub page cards. */
export function useAllRoadmapProgress() {
  const [store, setStore] = useState<Store>(() => read());
  useEffect(() => {
    const sync = () => setStore(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return store;
}

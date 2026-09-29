/**
 * The weekly league as this browser last saw it (GET /api/leagues/current):
 * the board, the countdown, the learner's own place and last week's result.
 *
 * Signed in, it is fetched as soon as the server is online (the reminder
 * banner shows last week's result from it); a guest's board is fetched when
 * the weekly tab asks (`refreshLeague`) - and again for whoever is viewing
 * after a sign-in or sign-out, once it has been asked for. Never cached across reloads - the
 * board is live, and a different viewer sees a different one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LeagueView } from '@/types';
import { api, ApiError } from '../api-client/api';
import { browserTimeZone } from '../time/days';

/**
 * 'idle'        not fetched yet
 * 'ready'       `league` is the server's (it may say the league is off)
 * 'unavailable' the server could not be reached (nothing fetched yet)
 * 'missing'     an older server with no league (404): the weekly tab hides
 */
export type LeagueStatus = 'idle' | 'ready' | 'unavailable' | 'missing';

export interface LeagueStateApi {
  league: LeagueView | null;
  leagueStatus: LeagueStatus;
  /** When `league` arrived (ms), so a countdown can run from it. */
  leagueFetchedAt: number | null;
  refreshLeague: () => Promise<void>;
}

export function useLeagueState({ owner, online }: { owner: string | null; online: boolean }): LeagueStateApi {
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [status, setStatus] = useState<LeagueStatus>('idle');
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  // Only the newest request may land: a slow one for the previous viewer never overwrites.
  const seq = useRef(0);
  // The weekly tab has asked for the board: whoever views next (a guest after a sign-out) gets it too.
  const wanted = useRef(false);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    let zone: string | null = null;
    // A guest's week and countdown are in this device's zone; an account's own zone is the server's to know.
    if (!ownerRef.current) {
      try {
        zone = browserTimeZone();
      } catch {
        zone = null;
      }
    }
    try {
      const view = await api.leagueCurrent(zone);
      if (mine !== seq.current) return;
      setLeague(view);
      setFetchedAt(Date.now());
      setStatus('ready');
    } catch (err) {
      if (mine !== seq.current) return;
      if (err instanceof ApiError && err.status === 404) {
        setLeague(null);
        setStatus('missing');
        return;
      }
      // Keep a board already on screen; otherwise say it could not be loaded.
      setStatus((prev) => (prev === 'ready' ? prev : 'unavailable'));
    }
  }, []);

  const refresh = useCallback(() => {
    wanted.current = true;
    return load();
  }, [load]);

  // Another viewer (sign-in, sign-out): their own place and result, fetched afresh.
  useEffect(() => {
    seq.current += 1;
    setLeague(null);
    setFetchedAt(null);
    setStatus('idle');
  }, [owner]);

  // Signed in: always (the banner). A guest (after a sign-out, say): once the board has been asked for.
  useEffect(() => {
    if (online && (owner || wanted.current)) void load();
  }, [online, owner, load]);

  return { league, leagueStatus: status, leagueFetchedAt: fetchedAt, refreshLeague: refresh };
}

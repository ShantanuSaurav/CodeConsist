import { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import type { EngagementSummary } from '../../services/adminApi';

/**
 * Goals and streaks across every learner (GET /admin/analytics/engagement),
 * for the "who this affects" lines on the goal, streak and reminder
 * sections. Null while loading, and when the server cannot say (an older
 * server, or offline) - the sections then simply leave the line out.
 */
export function useEngagement(): EngagementSummary | null {
  const [data, setData] = useState<EngagementSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    adminApi
      .engagement()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

/** "1 learner", "3 learners". */
export const learners = (n: number) => `${n} ${n === 1 ? 'learner' : 'learners'}`;

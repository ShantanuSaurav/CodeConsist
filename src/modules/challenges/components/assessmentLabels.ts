/**
 * The words a test-out or placement is labelled with. Kept apart from
 * AssessmentPanel so the practice modal (in the shell) can title its header
 * without pulling in the panel, which is fetched only when one runs.
 */
import type { AssessmentView, Stage } from '@/types';

/** "Stage 03 · Variables" - what the admin's `{stage}` stands for. */
export function stageLabel(stage: Pick<Stage, 'index' | 'name'> | null | undefined, fallback = 'this stage'): string {
  if (!stage) return fallback;
  return `Stage ${String(stage.index).padStart(2, '0')} · ${stage.name}`;
}

/**
 * "Test out · Stage 03" or "Placement · 2 of 3": the modal header while one
 * runs. `stageId` counts from that stage test instead of the one the record
 * is on now (the screen after a test shows the test just taken).
 */
export function assessmentHeading(
  view: Pick<AssessmentView, 'kind' | 'cursor' | 'stageIds'>,
  stage: Pick<Stage, 'index'> | null | undefined,
  stageId: string | null = null
): string {
  if (view.kind === 'placement') {
    const at = stageId ? view.stageIds.indexOf(stageId) : -1;
    const position = at >= 0 ? at + 1 : Math.min(view.cursor + 1, view.stageIds.length);
    return `Placement · ${position} of ${view.stageIds.length}`;
  }
  return `Test out${stage ? ` · Stage ${String(stage.index).padStart(2, '0')}` : ''}`;
}

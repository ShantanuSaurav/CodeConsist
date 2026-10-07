import { useSyncExternalStore } from 'react';
import { appendPlaygroundRun, type PlaygroundProgram, type PlaygroundRun } from '@/platform/playground/model';

const histories = new Map<string, PlaygroundRun[]>();
const listeners = new Set<() => void>();
const empty: PlaygroundRun[] = [];
let pendingGuestProgram: PlaygroundProgram | null = null;
export const guestProgramToSave = () => pendingGuestProgram;
export const setGuestProgramToSave = (program: PlaygroundProgram | null) => { pendingGuestProgram = program; };
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function recordPlaygroundRun(owner: string, run: PlaygroundRun): void {
  histories.set(owner, appendPlaygroundRun(histories.get(owner) ?? [], run));
  listeners.forEach((listener) => listener());
}
export function forgetPlaygroundRun(owner: string, id: string): void {
  histories.set(owner, (histories.get(owner) ?? []).filter((run) => run.id !== id));
  listeners.forEach((listener) => listener());
}
export function usePlaygroundHistory(owner: string): PlaygroundRun[] {
  return useSyncExternalStore(subscribe, () => histories.get(owner) ?? empty, () => empty);
}

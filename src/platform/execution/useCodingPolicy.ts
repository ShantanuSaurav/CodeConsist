import { useSyncExternalStore } from 'react';
import { getSettingsSnapshot, subscribe } from '../settings/store';
import { executionDisabledReason, type CodingWorkflow } from './policy';

export function useCodingPolicy(language: string, workflow: CodingWorkflow = 'playground'): string | null {
  const settings = useSyncExternalStore(subscribe, getSettingsSnapshot, getSettingsSnapshot);
  return executionDisabledReason(settings.coding, language, workflow);
}

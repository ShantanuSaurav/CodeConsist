import type { SupportedLanguage } from '@/types';

export function largeProgramNotice(language: SupportedLanguage): string {
  if (language === 'python' || language === 'sql') {
    return 'Runs in your browser and uses your device’s resources. Close unused tabs on low-memory devices. Larger runs still have time and memory limits.';
  }
  if (language === 'javascript' || language === 'typescript') {
    return 'Normally runs on our server; offline browser execution uses your device’s resources. Server runs may be refused when resources are busy. Close unused tabs only when running in your browser. Limits still apply.';
  }
  return 'Runs on our server, not your device. Larger runs may wait or be refused when server resources are busy. Time and memory limits still apply.';
}

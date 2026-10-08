export function executionProfile(payload = {}) {
  return payload.profile === 'large' && !payload.entryFunction && !payload.testCases?.length ? 'large' : 'standard';
}

const STANDARD = Object.freeze({
  jsSetupMs: 3000, jsProcessMs: 8000, jsHeapMb: 128, workerMs: 6000,
  pythonMs: 8000, sqlMs: 6000, sqlHeapBytes: 33554432, sqlPages: 4096,
  sqlProcessHeapMb: 96, judgeCpuSeconds: 5, judgeWallSeconds: 10,
  judgeMemoryKb: 128000, judgeRequestMs: 20000, javaHeapMb: 256
});

const LARGE = Object.freeze({
  jsSetupMs: 20000, jsProcessMs: 25000, jsHeapMb: 512, workerMs: 20000,
  pythonMs: 20000, sqlMs: 20000, sqlHeapBytes: 134217728, sqlPages: 16384,
  sqlProcessHeapMb: 192, judgeCpuSeconds: 10, judgeWallSeconds: 15,
  judgeMemoryKb: 524288, judgeRequestMs: 45000, javaHeapMb: 512
});

export function executionLimits(payload = {}) {
  return executionProfile(payload) === 'large' ? LARGE : STANDARD;
}

export function executionBudgetLabel(language, profile) {
  const limits = executionLimits({ profile });
  if (language === 'sql') return `${limits.sqlMs / 1000}s · ${limits.sqlHeapBytes / 1048576} MiB SQLite heap · ${limits.sqlPages / 256} MiB database · output limited to 1,000 rows / 200 KB.`;
  if (language === 'python') return `${limits.pythonMs / 1000}s after Python loads · browser/device memory limits apply.`;
  if (language === 'javascript' || language === 'typescript') return `Server: ${limits.jsSetupMs / 1000}s · ${limits.jsHeapMb} MiB JavaScript heap (not total process memory). Browser fallback: ${limits.workerMs / 1000}s, device memory limits apply.`;
  if (profile !== 'large') return 'Standard compiler limits · choose Large program for memory-intensive algorithms.';
  return `${limits.judgeCpuSeconds}s CPU · ${limits.judgeWallSeconds}s wall time · ${language === 'java' ? `${limits.javaHeapMb} MiB heap on self-hosted Java` : '512 MiB address space'}. Compiler configuration may impose lower limits.`;
}

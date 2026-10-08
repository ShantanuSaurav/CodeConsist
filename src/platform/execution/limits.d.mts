export type ExecutionProfile = 'standard' | 'large';
export interface ExecutionBudgetRequest { profile?: ExecutionProfile; entryFunction?: string; testCases?: readonly unknown[] }
export interface ExecutionLimits {
  jsSetupMs: number; jsProcessMs: number; jsHeapMb: number; workerMs: number;
  pythonMs: number; sqlMs: number; sqlHeapBytes: number; sqlPages: number;
  sqlProcessHeapMb: number; judgeCpuSeconds: number; judgeWallSeconds: number;
  judgeMemoryKb: number; judgeRequestMs: number; javaHeapMb: number;
}
export function executionProfile(payload?: ExecutionBudgetRequest): ExecutionProfile;
export function executionLimits(payload?: ExecutionBudgetRequest): Readonly<ExecutionLimits>;
export function executionBudgetLabel(language: string, profile: ExecutionProfile): string;

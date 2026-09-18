/**
 * Presentational primitives with no business logic. Anything may import them;
 * they import nothing but types and config.
 */
export { CodeBlock } from './primitives/CodeBlock';
export { CodeEditor } from './primitives/CodeEditor';
export { PageHeader } from './primitives/PageHeader';
export { LearningModeSwitch } from './primitives/LearningModeSwitch';
export { ErrorBoundary } from './primitives/ErrorBoundary';
export { ToastProvider, Toasts, useToast } from './primitives/toast';
export type { Toast, ToastTone } from './primitives/toast';
export { useFocusTrap } from './hooks/useFocusTrap';
export { useBodyScrollLock } from './hooks/useBodyScrollLock';
export { tokenize, tokenizeLine } from './code/highlight';
export { PageSkeleton, AppSplash, Bone } from './primitives/Skeleton';

import type { AutoTagInstallProgress } from '../../app/types';

export interface AutoTagProgressCopy {
  starting: string;
  repository: string;
  model: string;
  environment: string;
  completed: string;
  failed: string;
  fallback: string;
}

export function getAutoTagProgressText(
  progress: AutoTagInstallProgress,
  copy: AutoTagProgressCopy
) {
  if (progress.completed || progress.phase === 'completed') return copy.completed;
  if (progress.error || progress.phase === 'error') return copy.failed;

  switch (progress.phase) {
    case 'starting':
      return copy.starting;
    case 'repository':
      return copy.repository;
    case 'model':
      return copy.model;
    case 'environment':
      return copy.environment;
    default:
      return copy.fallback;
  }
}

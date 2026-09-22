import { useQuery } from '@tanstack/react-query';
import { runDiagnostics } from './engine';
import type { HealthReport } from './types';

export function useHealthReport(enabled = true) {
  return useQuery<HealthReport>({
    queryKey: ['health-report'],
    queryFn: () => runDiagnostics(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled,
  });
}

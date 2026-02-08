import useSWR from 'swr';
import type { Plan } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function usePlan(planId: string | null) {
  const { data, error, mutate } = useSWR<{ plan: Plan }>(
    planId ? `/api/plans/${planId}` : null,
    fetcher,
    { refreshInterval: 3000 },
  );

  return {
    plan: data?.plan ?? null,
    isLoading: !error && !data,
    error,
    mutate,
  };
}

import useSWR from 'swr';
import type { Plan } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function usePlans(filters?: { phase?: string }) {
  const params = new URLSearchParams();
  if (filters?.phase) params.set('phase', filters.phase);
  const query = params.toString();

  const { data, error, mutate } = useSWR<{ plans: Plan[] }>(
    `/api/plans${query ? `?${query}` : ''}`,
    fetcher,
    { refreshInterval: 5000 },
  );

  return {
    plans: data?.plans ?? [],
    isLoading: !error && !data,
    error,
    mutate,
  };
}

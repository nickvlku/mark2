import useSWR from 'swr';
import type { Task } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useTasks(filters?: { phase?: string; story_id?: string }) {
  const params = new URLSearchParams();
  if (filters?.phase) params.set('phase', filters.phase);
  if (filters?.story_id) params.set('story_id', filters.story_id);
  const query = params.toString();

  const { data, error, mutate } = useSWR<{ tasks: Task[] }>(
    `/api/tasks${query ? `?${query}` : ''}`,
    fetcher,
    { refreshInterval: 5000 },
  );

  return {
    tasks: data?.tasks ?? [],
    isLoading: !error && !data,
    error,
    mutate,
  };
}

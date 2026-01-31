import useSWR from 'swr';
import type { Story } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useStories() {
  const { data, error, mutate } = useSWR<{ stories: Story[] }>(
    '/api/stories',
    fetcher,
    { refreshInterval: 10000 },
  );

  return {
    stories: data?.stories ?? [],
    isLoading: !error && !data,
    error,
    mutate,
  };
}

import useSWR from 'swr';
import type { StoryWithStatus } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useStories(archived: boolean = false) {
  const { data, error, mutate } = useSWR<{ stories: StoryWithStatus[] }>(
    `/api/stories?archived=${archived}`,
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

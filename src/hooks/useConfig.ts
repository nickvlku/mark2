import useSWR from 'swr';
import type { Config } from '@/types';

interface ConfigResponse {
  config: Config;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useConfig() {
  const { data, error, mutate, isLoading } = useSWR<ConfigResponse>('/api/config', fetcher);

  const updateConfig = async (updates: Partial<Config>) => {
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update config');
      }

      await mutate();
      return true;
    } catch (err) {
      console.error('Failed to update config:', err);
      throw err;
    }
  };

  return {
    config: data?.config,
    error,
    isLoading,
    mutate,
    updateConfig,
  };
}

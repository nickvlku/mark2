import useSWR from 'swr';
import type { AgentDefinition } from '@/types';

interface AgentsResponse {
  agents: AgentDefinition[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useAgents() {
  const { data, error, mutate, isLoading } = useSWR<AgentsResponse>('/api/agents', fetcher);
  
  return {
    agents: data?.agents || [],
    error,
    isLoading,
    mutate,
  };
}
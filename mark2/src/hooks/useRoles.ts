import useSWR from 'swr';
import type { Role } from '@/types';

interface RolesResponse {
  roles: Role[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useRoles() {
  const { data, error, mutate, isLoading } = useSWR<RolesResponse>('/api/roles', fetcher);
  
  return {
    roles: data?.roles || [],
    error,
    isLoading,
    mutate,
  };
}

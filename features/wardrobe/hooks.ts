'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/client/api';
import type { Garment, Outfit, Preferences } from '../../types/wardrobe';
export function useWardrobe(owner: string) {
  return useQuery({
    queryKey: ['garments', owner],
    queryFn: () => api<{ items: Garment[] }>('/api/garments'),
  });
}
export function usePreferences(owner: string) {
  return useQuery({
    queryKey: ['preferences', owner],
    queryFn: () => api<Preferences>('/api/preferences'),
  });
}
export function useOutfits(owner: string) {
  return useQuery({
    queryKey: ['outfits', owner],
    queryFn: () => api<{ items: Outfit[] }>('/api/outfits'),
  });
}
export function useRefreshWardrobe(owner: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['garments', owner] }),
      client.invalidateQueries({ queryKey: ['outfits', owner] }),
    ]);
}

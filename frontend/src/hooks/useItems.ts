import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { Item } from '@/types'

interface ItemsParams {
  q?: string
  category?: string
  supplier?: string
  package?: string
  skip?: number
  limit?: number
}

interface ItemsResponse {
  data: Item[]
  total: number
  skip: number
  limit: number
}

export interface ItemMeta {
  categories: string[]
  packages: string[]
  suppliers: string[]
}

export function useItems(params: ItemsParams) {
  return useQuery<ItemsResponse>({
    queryKey: ['items', params],
    queryFn: async () => {
      const res = await api.get('/items', { params })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

// category param → packages cascade to only that category's packages
export function useItemMeta(category?: string) {
  return useQuery<ItemMeta>({
    queryKey: ['items-meta', category ?? ''],
    queryFn: async () => (await api.get('/items/meta', { params: category ? { category } : {} })).data,
    staleTime: 5 * 60_000,
  })
}

// All categories (no filter) — used for category dropdown
export function useItemMetaAll() {
  return useQuery<ItemMeta>({
    queryKey: ['items-meta', ''],
    queryFn: async () => (await api.get('/items/meta')).data,
    staleTime: 5 * 60_000,
  })
}

export function useItemAlternatives(stableId: string | null) {
  return useQuery<{ items: Item[]; alreadyLinked: string[] }>({
    queryKey: ['item-alternatives', stableId],
    queryFn: async () => (await api.get(`/items/${stableId}/alternatives`)).data,
    enabled: !!stableId,
  })
}

export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stableId, data }: { stableId: string; data: Partial<Item> }) =>
      api.patch(`/items/${stableId}`, data).then(r => r.data),
    onMutate: async ({ stableId, data }) => {
      await qc.cancelQueries({ queryKey: ['items'] })
      const snapshots = qc.getQueriesData<{ data: Item[]; total: number; skip: number; limit: number }>({ queryKey: ['items'] })
      qc.setQueriesData<{ data: Item[]; total: number; skip: number; limit: number }>(
        { queryKey: ['items'] },
        (old) => old ? { ...old, data: old.data.map(i => i.stableId === stableId ? { ...i, ...data } : i) } : old,
      )
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, val]) => qc.setQueryData(key, val))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['items-meta'] })
    },
  })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Item>) => api.post('/items', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['items-meta'] })
    },
  })
}

export function useLinkAlternative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stableId, targetId }: { stableId: string; targetId: string }) =>
      api.post(`/items/${stableId}/alternatives/link`, { targetId }).then(r => r.data),
    onSuccess: (_d, { stableId }) => {
      qc.invalidateQueries({ queryKey: ['item-alternatives', stableId] })
      qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

export function useUnlinkAlternative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stableId, targetId }: { stableId: string; targetId: string }) =>
      api.delete(`/items/${stableId}/alternatives/unlink`, { data: { targetId } }).then(r => r.data),
    onSuccess: (_d, { stableId }) => {
      qc.invalidateQueries({ queryKey: ['item-alternatives', stableId] })
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['product-items'] })
      qc.invalidateQueries({ queryKey: ['bom-rows'] })
    },
  })
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stableId: string) => api.delete(`/items/${stableId}`).then(r => r.data),
    onMutate: async (stableId) => {
      await qc.cancelQueries({ queryKey: ['items'] })
      const snapshots = qc.getQueriesData<{ data: Item[]; total: number; skip: number; limit: number }>({ queryKey: ['items'] })
      qc.setQueriesData<{ data: Item[]; total: number; skip: number; limit: number }>(
        { queryKey: ['items'] },
        (old) => old ? { ...old, data: old.data.filter(i => i.stableId !== stableId), total: old.total - 1 } : old,
      )
      return { snapshots }
    },
    onError: (_err, _id, ctx) => {
      ctx?.snapshots.forEach(([key, val]) => qc.setQueryData(key, val))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}

export function useDeleteItemsBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stableIds: string[]) => api.post('/items/bulk-delete', { stableIds }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

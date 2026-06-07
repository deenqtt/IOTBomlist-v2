import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ConfigSet } from '@/types'

type SetWithMeta = ConfigSet & {
  _count: { items: number }
  parent?: { id: number; name: string } | null
}

interface SetContentsRow {
  productId: number
  productName: string
  qty: number
}

export function useSets() {
  return useQuery<SetWithMeta[]>({
    queryKey: ['sets'],
    queryFn: async () => (await api.get('/sets')).data,
    staleTime: 30_000,
  })
}

export function useSetContents(id: number | null) {
  return useQuery<SetContentsRow[]>({
    queryKey: ['set-contents', id],
    queryFn: async () => (await api.get(`/sets/${id}/contents`)).data,
    enabled: !!id,
  })
}

export function useRenameSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.patch(`/sets/${id}`, { name }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sets'] })
      qc.invalidateQueries({ queryKey: ['costing-sets'] })
      qc.invalidateQueries({ queryKey: ['costing-projects'] })
    },
  })
}

export function useDeleteSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/sets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sets'] })
      qc.invalidateQueries({ queryKey: ['costing-sets'] })
      qc.invalidateQueries({ queryKey: ['costing-projects'] })
    },
  })
}

export function downloadSetBom(id: number, name: string, mode: string, token: string) {
  const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/sets/${id}/export?mode=${mode}`
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `BOM_${name.replace(/[^a-zA-Z0-9]/g, '_')}_${mode}.xlsx`
      a.click()
    })
}

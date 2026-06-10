import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { getToken } from '@/lib/auth'

interface SupersetItem {
  id: number
  supersetId: number
  setId: number
  qty: number
  orderIndex: number
  set: { id: number; name: string }
}

export interface Superset {
  id: number
  name: string
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
  items: SupersetItem[]
}

export function useSupersets() {
  return useQuery<Superset[]>({
    queryKey: ['supersets'],
    queryFn: async () => (await api.get('/supersets')).data,
    staleTime: 30_000,
  })
}

export function useSupersetContents(id: number) {
  return useQuery<{
    sets: { setId: number; setName: string; qty: number }[]
    products: {
      productId: number
      productName: string
      totalQty: number
      setContributions: { setName: string; qty: number }[]
    }[]
  }>({
    queryKey: ['superset-contents', id],
    queryFn: async () => (await api.get(`/supersets/${id}/contents`)).data,
    enabled: !!id,
  })
}

export function useCreateSuperset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; notes?: string; items: { setId: number; qty: number }[] }) =>
      api.post('/supersets', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supersets'] })
      qc.invalidateQueries({ queryKey: ['costing-projects'] })
    },
  })
}

export function useUpdateSuperset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; notes?: string; items?: { setId: number; qty: number }[] }) =>
      api.patch(`/supersets/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['supersets'] })
      qc.invalidateQueries({ queryKey: ['superset-contents', vars.id] })
      qc.invalidateQueries({ queryKey: ['costing-projects'] })
    },
  })
}

export function useDeleteSuperset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/supersets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supersets'] })
      qc.invalidateQueries({ queryKey: ['costing-projects'] })
    },
  })
}

export function downloadSupersetBom(id: number, name: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || ''
  return fetch(`${baseUrl}/supersets/${id}/export`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.blob()).then(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.replace(/[^a-z0-9_-]/gi, '_')}_Project_BOM.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  })
}

export { getToken }

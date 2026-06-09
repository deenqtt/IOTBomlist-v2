import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

export interface AdminUser {
  id: number
  username: string
  role: string
  createdAt: string
}

export interface ChangeLogEntry {
  id: number
  entity: string
  entityId: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  changedBy: string | null
  changedAt: string
  context: string | null
}

export interface ChangeLogResponse {
  data: ChangeLogEntry[]
  total: number
  skip: number
  limit: number
}

export interface WarehouseItem {
  stableId: string
  partNumber: string | null
  productName: string | null
  stockQty: number | null
  whQty: number | null
  whLocation: string | null
}

export interface WarehouseResponse {
  data: WarehouseItem[]
  total: number
  skip: number
  limit: number
}

export function useAdminUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: async () => (await api.get('/admin/users')).data,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { username: string; password: string; role: string }) =>
      api.post('/admin/users', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; role?: string; passwordHash?: string }) =>
      api.patch(`/admin/users/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}

export function useChangeLog(params: { entity?: string; q?: string; from?: string; to?: string; skip?: number; limit?: number }) {
  return useQuery<ChangeLogResponse>({
    queryKey: ['changelog', params],
    queryFn: async () => (await api.get('/admin/changelog', { params })).data,
    placeholderData: (prev) => prev,
  })
}

export function useWarehouse(params: { q?: string; skip?: number; limit?: number }) {
  return useQuery<WarehouseResponse>({
    queryKey: ['warehouse', params],
    queryFn: async () => (await api.get('/admin/warehouse', { params })).data,
    placeholderData: (prev) => prev,
  })
}

export function useUpdateWarehouse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stableId, whQty, whLocation }: { stableId: string; whQty?: number | null; whLocation?: string | null }) =>
      api.patch(`/admin/warehouse/${stableId}`, { whQty, whLocation }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouse'] }),
  })
}

export function useAdminSettings() {
  return useQuery<Record<string, string>>({
    queryKey: ['admin-settings'],
    queryFn: async () => (await api.get('/admin/settings')).data,
  })
}

export function useUpdateAdminSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, string>) => api.patch('/admin/settings', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }),
  })
}

export function useAutoBackups() {
  return useQuery<string[]>({
    queryKey: ['auto-backups'],
    queryFn: async () => (await api.get('/admin/backups/auto')).data,
  })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function downloadBackup(_token: string) {
  const now = new Date().toISOString().slice(0, 10)
  return api.get('/admin/backup', { responseType: 'blob' }).then(({ data }) => {
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = `bom_backup_${now}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function downloadAutoBackup(filename: string, _token: string) {
  return api.get(`/admin/backups/auto/${filename}`, { responseType: 'blob' }).then(({ data }) => {
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  })
}

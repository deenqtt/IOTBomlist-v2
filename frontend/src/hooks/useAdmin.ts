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

export function downloadBackup(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'
  return fetch(`${baseUrl}/admin/backup`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.blob()).then(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const now = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `bom_backup_${now}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  })
}

export function downloadAutoBackup(filename: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'
  return fetch(`${baseUrl}/admin/backups/auto/${filename}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.blob()).then(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  })
}

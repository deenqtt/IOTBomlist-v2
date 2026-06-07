import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { Product, ProductItem, ProductDocument, AnalyzeImportResult } from '@/types'

interface ProductsResponse {
  data: (Product & { _count: { items: number } })[]
  total: number
  skip: number
  limit: number
}

interface BomRowsResponse {
  data: (ProductItem & {
    product: { id: number; name: string }
    item: {
      stableId: string; partNumber?: string; productName?: string
      value?: string; category?: string; package?: string
      priceMin?: number; priceCurrency?: string; suppliers?: string
    }
  })[]
  total: number
  skip: number
  limit: number
}

interface UsageInSet {
  setId: number; setName: string
  productId: number; productName: string
  qty: number; op: string
}

export function useProducts(params?: { q?: string; skip?: number; limit?: number }) {
  return useQuery<ProductsResponse>({
    queryKey: ['products', params],
    queryFn: async () => (await api.get('/products', { params })).data,
    staleTime: 30_000,
  })
}

export function useAllProducts() {
  return useQuery<ProductsResponse>({
    queryKey: ['products-all'],
    queryFn: async () => (await api.get('/products', { params: { limit: 9999 } })).data,
    staleTime: 60_000,
  })
}

export function useProduct(id: number | null) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => (await api.get(`/products/${id}`)).data as Product & { _count: { items: number } },
    enabled: !!id,
    staleTime: 30_000,
  })
}

export function useBomRows(params: { productId?: number; q?: string; skip?: number; limit?: number }) {
  return useQuery<BomRowsResponse>({
    queryKey: ['bom-rows', params],
    queryFn: async () => (await api.get('/products/bom-rows', { params })).data,
    placeholderData: (prev) => prev,
  })
}

export function useProductUsageInSets(productIds: number[]) {
  return useQuery<UsageInSet[]>({
    queryKey: ['product-usage', productIds],
    queryFn: async () => (await api.get('/products/usage-in-sets', { params: { ids: productIds.join(',') } })).data,
    enabled: productIds.length > 0,
  })
}

export function useCloneProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, slug, copyReferences }: { id: number; name: string; slug?: string; copyReferences?: boolean }) =>
      api.post(`/products/${id}/clone`, { name, slug, copyReferences }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['products-all'] })
    },
  })
}

export function useMergeProducts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ keepId, mergeIds }: { keepId: number; mergeIds: number[] }) =>
      api.post('/products/merge', { keepId, mergeIds }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['products-all'] })
      qc.invalidateQueries({ queryKey: ['bom-rows'] })
    },
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['products-all'] })
      qc.invalidateQueries({ queryKey: ['bom-rows'] })
    },
  })
}

export function useProductItems(id: number | null) {
  return useQuery({
    queryKey: ['product-items', id],
    queryFn: async () => (await api.get(`/products/${id}/items`)).data as (ProductItem & { item: import('@/types').Item })[],
    enabled: !!id,
    staleTime: 10_000,
  })
}

export function useUpdateProductItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, stableId, data }: { productId: number; stableId: string; data: Partial<ProductItem> }) =>
      api.patch(`/products/${productId}/items/${stableId}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['product-items', vars.productId] })
      qc.invalidateQueries({ queryKey: ['bom-rows'] })
      qc.invalidateQueries({ queryKey: ['costing-products'] })
      qc.invalidateQueries({ queryKey: ['costing-sets'] })
      qc.invalidateQueries({ queryKey: ['costing-projects'] })
    },
  })
}

export function useAddProductItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, stableId, quantitySum, references, notes }: { productId: number; stableId: string; quantitySum?: number; references?: string; notes?: string }) =>
      api.post(`/products/${productId}/items`, { stableId, quantitySum, references, notes }).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['product-items', vars.productId] })
      qc.invalidateQueries({ queryKey: ['bom-rows'] })
      qc.invalidateQueries({ queryKey: ['costing-products'] })
      qc.invalidateQueries({ queryKey: ['costing-sets'] })
      qc.invalidateQueries({ queryKey: ['costing-projects'] })
    },
  })
}

export function useRemoveProductItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, stableId }: { productId: number; stableId: string }) =>
      api.delete(`/products/${productId}/items/${stableId}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['product-items', vars.productId] })
      qc.invalidateQueries({ queryKey: ['bom-rows'] })
      qc.invalidateQueries({ queryKey: ['costing-products'] })
      qc.invalidateQueries({ queryKey: ['costing-sets'] })
      qc.invalidateQueries({ queryKey: ['costing-projects'] })
    },
  })
}

export function useRemoveProductItemsBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, stableIds }: { productId: number; stableIds: string[] }) =>
      api.post(`/products/${productId}/items/bulk-delete`, { stableIds }).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['product-items', vars.productId] })
      qc.invalidateQueries({ queryKey: ['bom-rows'] })
      qc.invalidateQueries({ queryKey: ['costing-products'] })
      qc.invalidateQueries({ queryKey: ['costing-sets'] })
      qc.invalidateQueries({ queryKey: ['costing-projects'] })
    },
  })
}

export function useImportBomBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, items }: { productId: number; items: { identifier: string; quantity: number; references?: string; notes?: string }[] }) =>
      api.post(`/products/${productId}/items/bulk-add`, { items }).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['product-items', vars.productId] })
      qc.invalidateQueries({ queryKey: ['bom-rows'] })
      qc.invalidateQueries({ queryKey: ['product', vars.productId] })
    },
  })
}

export function useCreateProductImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, items }: { name: string; items: { identifier: string; quantity: number; references?: string; notes?: string }[] }) =>
      api.post('/products/import', { name, items }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['products-all'] })
    },
  })
}

export function useRenameProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, slug }: { id: number; name: string; slug?: string }) =>
      api.patch(`/products/${id}`, { name, slug }).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['products-all'] })
      qc.invalidateQueries({ queryKey: ['bom-rows'] })
      qc.invalidateQueries({ queryKey: ['product-items', vars.id] })
    },
  })
}

export function useAnalyzeImport() {
  return useMutation({
    mutationFn: (items: { identifier: string; qty: number }[]) =>
      api.post('/products/import/analyze', { items }).then(r => r.data as AnalyzeImportResult),
  })
}

export function useProductDocuments(id: number | null) {
  return useQuery<ProductDocument[]>({
    queryKey: ['product-documents', id],
    queryFn: async () => (await api.get(`/products/${id}/documents`)).data,
    enabled: !!id,
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, file, type }: { productId: number; file: File; type: string }) => {
      const form = new FormData()
      form.append('file', file)
      form.append('type', type)
      return api.post(`/products/${productId}/documents/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data as ProductDocument)
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['product-documents', vars.productId] })
    },
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, docId }: { productId: number; docId: number }) =>
      api.delete(`/products/${productId}/documents/${docId}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['product-documents', vars.productId] })
    },
  })
}

export function useUploadProductImage(productId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post(`/products/${productId}/image`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data as { imageUrl: string }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product', productId] }),
  })
}

export function useDeleteProductImage(productId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete(`/products/${productId}/image`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product', productId] }),
  })
}

export async function downloadProductFile(productId: number, type: 'bom' | 'bom-alt' | 'reference', productName: string, tempOverrides?: Record<string, unknown>) {
  let url = type === 'reference'
    ? `/products/${productId}/export/reference`
    : `/products/${productId}/export/bom${type === 'bom-alt' ? '?alt=true' : '?alt=false'}`

  if (tempOverrides && Object.keys(tempOverrides).length > 0 && type !== 'reference') {
    url += `&tempOverrides=${encodeURIComponent(JSON.stringify(tempOverrides))}`
  }

  const res = await api.get(url, { responseType: 'blob' })
  const suffix = type === 'reference' ? 'Reference' : type === 'bom-alt' ? 'BOM_ALT' : 'BOM'
  const filename = `${suffix}_${productName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(res.data)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

export interface AnalyticsSummary {
  totalItems: number
  totalProducts: number
  totalSets: number
  totalSupersets: number
  bomRows: number
  enrichedItems: number
  missingPrices: number
}

export interface CategoryBreakdown {
  category: string
  count: number
}

export interface SupplierBreakdown {
  supplier: string
  count: number
}

export interface MissingBySet {
  setId: number
  setName: string
  products: number
  bomRows: number
  missingPrices: number
}

export interface ProjectHealth {
  id: number
  name: string
  coverage: number
  totalRows: number
  missingRows: number
}

export function useAnalyticsSummary() {
  return useQuery<AnalyticsSummary>({
    queryKey: ['analytics-summary'],
    queryFn: async () => (await api.get('/analytics/summary')).data,
    staleTime: 60_000,
  })
}

export function useAnalyticsByCategory() {
  return useQuery<CategoryBreakdown[]>({
    queryKey: ['analytics-by-category'],
    queryFn: async () => (await api.get('/analytics/by-category')).data,
    staleTime: 60_000,
  })
}

export function useAnalyticsBySupplier() {
  return useQuery<SupplierBreakdown[]>({
    queryKey: ['analytics-by-supplier'],
    queryFn: async () => (await api.get('/analytics/by-supplier')).data,
    staleTime: 60_000,
  })
}

export function useAnalyticsMissingBySet() {
  return useQuery<MissingBySet[]>({
    queryKey: ['analytics-missing-by-set'],
    queryFn: async () => (await api.get('/analytics/missing-by-set')).data,
    staleTime: 60_000,
  })
}

export function useAnalyticsProjectHealth() {
  return useQuery<ProjectHealth[]>({
    queryKey: ['analytics-project-health'],
    queryFn: async () => (await api.get('/analytics/project-health')).data,
    staleTime: 60_000,
  })
}

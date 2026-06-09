import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

export interface ProductCost {
  productId: number
  productName: string
  bomRows: number
  missingPrices: number
  totalUSD: number
  total: number
  altTotalUSD: number
  altTotal: number
  currency: string
}

export interface SetCost {
  setId: number
  setName: string
  parentName: string | null
  products: number
  missingPrices: number
  totalUSD: number
  total: number
  altTotalUSD: number
  altTotal: number
  currency: string
}

export interface SupplierCost {
  supplier: string
  lines: number
  totalUSD: number
  total: number
  currency: string
}

export interface ProjectCost {
  projectId: number
  projectName: string
  productCount: number
  missingPrices: number
  totalUSD: number
  total: number
  altTotalUSD: number
  altTotal: number
  currency: string
  budgetDrainers: {
    stableId: string
    pn: string
    name: string
    qty: number
    price: number
    totalCost: number
  }[]
}

export function useProductCosts(currency: string, ids?: number[]) {
  return useQuery<ProductCost[]>({
    queryKey: ['costing-products', currency, ids],
    queryFn: async () => (await api.get('/costing/products', { 
      params: { currency, ids: ids?.join(',') } 
    })).data,
    staleTime: 0,
  })
}

export function useSetCosts(currency: string, ids?: number[]) {
  return useQuery<SetCost[]>({
    queryKey: ['costing-sets', currency, ids],
    queryFn: async () => (await api.get('/costing/sets', { 
      params: { currency, ids: ids?.join(',') } 
    })).data,
    staleTime: 0,
  })
}

export function useSupplierCosts(currency: string) {
  return useQuery<SupplierCost[]>({
    queryKey: ['costing-by-supplier', currency],
    queryFn: async () => (await api.get('/costing/by-supplier', { params: { currency } })).data,
    staleTime: 0,
  })
}

export function useProjectCosts(currency: string, ids?: number[]) {
  return useQuery<ProjectCost[]>({
    queryKey: ['costing-projects', currency, ids],
    queryFn: async () => (await api.get('/costing/supersets', { 
      params: { currency, ids: ids?.join(',') } 
    })).data,
    staleTime: 0,
  })
}

export function useCostingRates() {
  return useQuery<Record<string, number>>({
    queryKey: ['costing-rates'],
    queryFn: async () => (await api.get('/costing/rates')).data,
    staleTime: 300_000,
  })
}

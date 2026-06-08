import { useState, useCallback } from 'react'
import api from '@/lib/api'

export interface LookupResult {
  mpn?: string
  manufacturer?: string
  mouser_pn?: string
  dk_pn?: string
  lcsc?: string
  price?: number | null
  moq?: number | null
  priceBreaks?: { qtyFrom: number; qtyTo: number | null; unitPrice: number }[] | null
  url?: string | null
  datasheet?: string | null
  description?: string | null
  category?: string | null
  image?: string | null
  availability?: string | null
  quantity_available?: number | null
  value?: string | null
  voltageRating?: string | null
  tolerance?: string | null
  package?: string | null
  specs?: string | null
  source: 'lcsc' | 'mouser' | 'digikey' | 'other'
}

interface LookupState {
  loading: boolean
  results: LookupResult[]
  error: string | null
}

const EMPTY: LookupState = { loading: false, results: [], error: null }

export function useLcscLookup() {
  const [state, setState] = useState<LookupState>(EMPTY)

  const search = useCallback(async (lcscCode?: string, pn?: string) => {
    if (!lcscCode && !pn) return
    setState({ loading: true, results: [], error: null })
    try {
      let results: LookupResult[] = []
      
      if (lcscCode) {
        // Specific lookup for LCSC C-code
        const res = await api.post('/lcsc/lookup', { items: [{ lcsc: lcscCode }] })
        results = (res.data?.items ?? []) as LookupResult[]
      } else if (pn) {
        // Keyword search if only PN/keyword is provided
        const res = await api.post('/lcsc/search', { keyword: pn, limit: 10 })
        results = (res.data?.items ?? []) as LookupResult[]
      }

      setState({ loading: false, results: results.map(r => ({ ...r, source: 'lcsc' as const })), error: null })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setState({ loading: false, results: [], error: err?.response?.data?.error ?? 'LCSC lookup failed' })
    }
  }, [])

  const reset = useCallback(() => setState(EMPTY), [])
  return { ...state, search, reset }
}

export function useMouserSearch() {
  const [state, setState] = useState<LookupState>(EMPTY)

  const search = useCallback(async (keyword: string, pn?: string) => {
    if (!keyword && !pn) return
    setState({ loading: true, results: [], error: null })
    try {
      const res = await api.post('/mouser/search', { keyword: keyword || undefined, pn: pn || undefined, limit: 10 })
      const raw = (res.data?.items ?? []) as LookupResult[]
      setState({ loading: false, results: raw.map(r => ({ ...r, source: 'mouser' as const })), error: null })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setState({ loading: false, results: [], error: err?.response?.data?.error ?? 'Mouser search failed' })
    }
  }, [])

  const reset = useCallback(() => setState(EMPTY), [])
  return { ...state, search, reset }
}

export function useDigikeySearch() {
  const [state, setState] = useState<LookupState>(EMPTY)

  const search = useCallback(async (keyword: string, pn?: string) => {
    if (!keyword && !pn) return
    setState({ loading: true, results: [], error: null })
    try {
      const res = await api.post('/digikey/search', { keyword: keyword || undefined, pn: pn || undefined, limit: 10 })
      const raw = (res.data?.items ?? []) as LookupResult[]
      setState({ loading: false, results: raw.map(r => ({ ...r, source: 'digikey' as const })), error: null })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setState({ loading: false, results: [], error: err?.response?.data?.error ?? 'DigiKey search failed' })
    }
  }, [])

  const reset = useCallback(() => setState(EMPTY), [])
  return { ...state, search, reset }
}

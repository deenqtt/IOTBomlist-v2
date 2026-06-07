'use client'

import { useState, useEffect } from 'react'
import { useLcscLookup, useMouserSearch, useDigikeySearch, LookupResult } from '@/hooks/usePriceLookup'
import { useUpdateItem } from '@/hooks/useItems'
import type { Item, SupplierPricesMap } from '@/types'
import { X, Search, RefreshCw, ExternalLink, Check, ChevronDown, ChevronUp } from 'lucide-react'

type Source = 'lcsc' | 'mouser' | 'digikey' | 'other'

const SOURCE_LABELS: Record<Source, string> = {
  lcsc: 'LCSC / JLCPCB',
  mouser: 'Mouser',
  digikey: 'DigiKey',
  other: 'Other',
}

const SOURCE_COLORS: Record<Source, string> = {
  lcsc: 'text-blue-600 border-blue-200 bg-blue-50',
  mouser: 'text-green-600 border-green-200 bg-green-50',
  digikey: 'text-orange-600 border-orange-200 bg-orange-50',
  other: 'text-muted-foreground border-border bg-muted/60',
}

function PriceBreaksTable({ breaks }: { breaks: { qtyFrom: number; qtyTo: number | null; unitPrice: number }[] }) {
  const [open, setOpen] = useState(false)
  if (!breaks?.length) return null
  return (
    <div className="mt-1.5">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        {breaks.length} price breaks
      </button>
      {open && (
        <div className="mt-1 border border-border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-2 py-1 text-left font-medium text-muted-foreground">Qty From</th>
                <th className="px-2 py-1 text-right font-medium text-muted-foreground">Unit Price</th>
              </tr>
            </thead>
            <tbody>
              {breaks.map((b, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-1">{b.qtyFrom.toLocaleString()}+</td>
                  <td className="px-2 py-1 text-right font-mono">$ {b.unitPrice.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ResultCard({ result, onApply, applying }: {
  result: LookupResult
  onApply: (r: LookupResult) => void
  applying: boolean
}) {
  return (
    <div className="border border-border rounded-lg p-3 flex flex-col gap-2 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{result.mpn ?? '—'}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${SOURCE_COLORS[result.source]}`}>
              {result.source === 'lcsc' ? result.lcsc ?? SOURCE_LABELS[result.source] : SOURCE_LABELS[result.source]}
            </span>
          </div>
          {result.manufacturer && (
            <p className="text-xs text-muted-foreground mt-0.5">{result.manufacturer}</p>
          )}
          {result.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate" title={result.description}>{result.description}</p>
          )}
        </div>
        {result.url && (
          <a href={result.url} target="_blank" rel="noopener noreferrer"
            className="p-1 rounded hover:bg-accent text-muted-foreground shrink-0"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Price</span>
          <p className="font-mono font-semibold">
            {result.price != null ? `$ ${result.price.toFixed(4)}` : '—'}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">MOQ</span>
          <p className="font-mono">{result.moq ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Stock</span>
          <p className="font-mono">{result.quantity_available != null ? result.quantity_available.toLocaleString() : '—'}</p>
        </div>
      </div>

      {result.priceBreaks && <PriceBreaksTable breaks={result.priceBreaks} />}

      <button
        onClick={() => onApply(result)}
        disabled={applying || result.price == null}
        className="mt-1 flex items-center justify-center gap-1.5 w-full py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {applying ? <><RefreshCw size={11} className="animate-spin" /> Applying...</> : <><Check size={11} /> Apply to Item</>}
      </button>
    </div>
  )
}

export function PriceLookupPanel({ item, onClose }: {
  item: Item
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<Source>('lcsc')
  const [query, setQuery] = useState(item.partNumber ?? '')
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)

  const lcsc = useLcscLookup()
  const mouser = useMouserSearch()
  const digikey = useDigikeySearch()
  const updateItem = useUpdateItem()

  // Extract stored LCSC C-code — supplierPrices.lcsc.pn stores MPN, not C-code
  // C-code is encoded in purchase URL: https://www.lcsc.com/product-detail/C5199242.html
  const storedLcscCode = (() => {
    try {
      const sp = item.supplierPrices ? JSON.parse(item.supplierPrices) : null
      // Try pn first (in case it IS a C-code)
      const pn = sp?.lcsc?.pn as string | null | undefined
      if (pn && /^C\d+$/i.test(pn)) return pn
      // Extract from purchase URL
      const url = sp?.lcsc?.url as string | null | undefined
      if (url) {
        const m = url.match(/\/(C\d+)\.html/i)
        if (m) return m[1]
      }
    } catch { /* ignore */ }
    // Fallback: stockCode field
    if (item.stockCode && /^C\d+$/i.test(item.stockCode)) return item.stockCode
    return null
  })()

  // Auto-search on open — LCSC uses stored C-code if available, else MPN
  useEffect(() => {
    const pn = item.partNumber
    if (!pn) return
    if (storedLcscCode) {
      lcsc.search(storedLcscCode, undefined) // search by C-code → accurate
    } else {
      lcsc.search(undefined, pn) // fallback to MPN
    }
    mouser.search(pn)
    digikey.search(pn)
  }, [item.stableId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch() {
    if (!query.trim()) return
    const q = query.trim()
    const isLcscCode = /^C\d+$/i.test(q)
    lcsc.reset(); mouser.reset(); digikey.reset()
    if (activeTab === 'lcsc') {
      lcsc.search(isLcscCode ? q : undefined, isLcscCode ? undefined : q)
    } else if (activeTab === 'mouser') {
      mouser.search(q)
    } else {
      digikey.search(q)
    }
  }

  function handleSearchAll() {
    const q = query.trim()
    if (!q) return
    const isLcscCode = /^C\d+$/i.test(q)
    // For LCSC: prefer stored C-code over user query if query looks like MPN
    const lcscCode = isLcscCode ? q : storedLcscCode
    lcsc.search(lcscCode ?? undefined, lcscCode ? undefined : q)
    mouser.search(q)
    digikey.search(q)
  }

  async function handleApply(result: LookupResult) {
    const key = `${result.source}-${result.mpn}`
    setApplyingId(key)
    try {
      const supplierName = result.source === 'lcsc' ? 'LCSC' : result.source === 'mouser' ? 'Mouser' : 'DigiKey'
      
      // Update supplierPrices map
      let spMap: SupplierPricesMap = {}
      if (item.supplierPrices) {
        try { spMap = JSON.parse(item.supplierPrices) } catch { /* ignore */ }
      }
      
      const supplierKey = result.source as keyof SupplierPricesMap;
      spMap[supplierKey] = {
        ...spMap[supplierKey],
        pn: result.source === 'lcsc' ? (result.lcsc ?? result.mpn) : result.mpn,
        price: result.price ?? null,
        moq: result.moq ?? null,
        priceBreaks: result.priceBreaks ?? null,
        url: result.url ?? null,
        quantity_available: result.quantity_available !== undefined && result.quantity_available !== null ? Number(result.quantity_available) : null,
      }

      await updateItem.mutateAsync({
        stableId: item.stableId,
        data: {
          priceMin: result.price ?? undefined,
          priceCurrency: 'USD',
          suppliers: item.suppliers
            ? item.suppliers.includes(supplierName) ? item.suppliers : `${item.suppliers};${supplierName}`
            : supplierName,
          supplierPrices: JSON.stringify(spMap)
        },
      })
      setApplied(key)
      setTimeout(() => setApplied(null), 2000)
    } finally {
      setApplyingId(null)
    }
  }

  const activeState = activeTab === 'lcsc' ? lcsc : activeTab === 'mouser' ? mouser : digikey

  const tabs: Source[] = ['lcsc', 'mouser', 'digikey']

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-card border-l border-border w-full max-w-md flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start justify-between shrink-0">
          <div>
            <h2 className="font-semibold text-sm">Price Lookup</h2>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{item.stableId}</p>
            {item.partNumber && <p className="text-xs text-muted-foreground">{item.partNumber}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-accent text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-3 border-b border-border shrink-0 flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Part number or LCSC C-code…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button onClick={handleSearch} className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90">
            Search
          </button>
          <button onClick={handleSearchAll} title="Search all sources" className="px-2 py-2 text-sm border border-border rounded-md hover:bg-accent text-muted-foreground text-xs">
            All
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {tabs.map(t => {
            const st = t === 'lcsc' ? lcsc : t === 'mouser' ? mouser : digikey
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors relative ${
                  activeTab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {SOURCE_LABELS[t].split(' ')[0]}
                {st.loading && <RefreshCw size={10} className="animate-spin inline ml-1" />}
                {!st.loading && st.results.length > 0 && (
                  <span className="ml-1 text-[10px] bg-primary text-primary-foreground rounded-full px-1">
                    {st.results.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {activeState.loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm gap-2">
              <RefreshCw size={14} className="animate-spin" /> Searching…
            </div>
          ) : activeState.error ? (
            <div className="flex flex-col items-center justify-center h-32 text-sm gap-2">
              <p className="text-destructive text-center">{activeState.error}</p>
              {activeState.error.includes('configured') && (
                <p className="text-xs text-muted-foreground text-center">Add API key in backend .env</p>
              )}
            </div>
          ) : activeState.results.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              {query ? 'No results' : 'Enter a part number to search'}
            </div>
          ) : activeState.results.map((r, i) => {
            const key = `${r.source}-${r.mpn}-${i}`
            return (
              <ResultCard
                key={key}
                result={r}
                onApply={handleApply}
                applying={applyingId === `${r.source}-${r.mpn}`}
              />
            )
          })}
        </div>

        {applied && (
          <div className="px-4 py-3 border-t border-border bg-green-50 text-green-700 text-xs font-medium shrink-0 flex items-center gap-2">
            <Check size={13} /> Price updated successfully
          </div>
        )}
      </div>
    </div>
  )
}

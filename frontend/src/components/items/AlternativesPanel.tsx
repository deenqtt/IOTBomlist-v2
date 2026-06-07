'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useItemAlternatives, useLinkAlternative, useUnlinkAlternative, useCreateItem } from '@/hooks/useItems'
import { useLcscLookup, useMouserSearch, useDigikeySearch, LookupResult } from '@/hooks/usePriceLookup'
import type { Item, SupplierPricesMap, SupplierPnEntry } from '@/types'
import {
  X, RefreshCw, Link2, ExternalLink,
  ChevronDown, ChevronUp, Plus, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

function genStableId(mpn: string): string {
  const slug = mpn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8)
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${slug}-${rand}`
}

const fieldCn = cn(
  'w-full px-2.5 py-1.5 text-xs border border-input rounded-md bg-background',
  'placeholder:text-muted-foreground/50',
  'focus:outline-none focus:ring-1 focus:ring-ring',
)

type SupplierTab = 'lcsc' | 'mouser' | 'digikey'

const SUPPLIER_LABELS: Record<SupplierTab, string> = { lcsc: 'LCSC', mouser: 'Mouser', digikey: 'DigiKey' }
const SUPPLIER_COLORS: Record<SupplierTab, string> = {
  lcsc: 'text-blue-600 dark:text-blue-300',
  mouser: 'text-green-600 dark:text-green-300',
  digikey: 'text-orange-600 dark:text-orange-300',
}

function PriceTag({ price, currency = 'USD' }: { price?: number | null; currency?: string }) {
  if (price == null) return <span className="text-muted-foreground">—</span>
  return <span className="font-mono font-semibold text-xs">${price.toFixed(4)} <span className="text-muted-foreground font-normal">{currency}</span></span>
}

function SupplierResultCard({ result, priceDiff, onSaveLink }: {
  result: LookupResult
  priceDiff?: number | null
  onSaveLink: () => void
}) {
  const [showBreaks, setShowBreaks] = useState(false)
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm">{result.mpn ?? '—'}</span>
            <span className={`text-xs font-medium ${SUPPLIER_COLORS[result.source as SupplierTab]}`}>
              {result.source === 'lcsc' && result.lcsc ? result.lcsc : SUPPLIER_LABELS[result.source as SupplierTab]}
            </span>
            {priceDiff != null && priceDiff < 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 font-medium">
                {Math.abs(priceDiff * 100).toFixed(0)}% cheaper
              </span>
            )}
          </div>
          {result.manufacturer && <p className="text-xs text-muted-foreground">{result.manufacturer}</p>}
          {result.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1" title={result.description}>{result.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {result.url && (
            <a href={result.url} target="_blank" rel="noopener noreferrer"
              className="p-1 rounded hover:bg-accent text-muted-foreground"
            >
              <ExternalLink size={12} />
            </a>
          )}
          <button
            onClick={onSaveLink}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-primary/30 text-primary hover:bg-primary/10 transition-colors font-medium"
            title="Save as new item and link as alternative"
          >
            <Plus size={11} />
            Save & Link
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
        <div>
          <span className="text-muted-foreground">Price</span>
          <p><PriceTag price={result.price} /></p>
        </div>
        <div>
          <span className="text-muted-foreground">MOQ</span>
          <p className="font-mono">{result.moq ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Supplier Stock</span>
          <p className={cn('font-mono font-semibold', result.quantity_available === 0 ? 'text-destructive' : result.quantity_available != null && result.quantity_available < 100 ? 'text-amber-500' : '')}>
            {result.quantity_available != null ? result.quantity_available.toLocaleString() : '—'}
          </p>
        </div>
      </div>
      {result.priceBreaks && result.priceBreaks.length > 0 && (
        <div className="mt-1.5">
          <button onClick={() => setShowBreaks(v => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {showBreaks ? <ChevronUp size={10} /> : <ChevronDown size={10} />} {result.priceBreaks.length} price breaks
          </button>
          {showBreaks && (
            <div className="mt-1 border border-border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/60"><tr>
                  <th className="px-2 py-1 text-left font-medium text-muted-foreground">Qty From</th>
                  <th className="px-2 py-1 text-right font-medium text-muted-foreground">Unit Price</th>
                </tr></thead>
                <tbody>
                  {result.priceBreaks.map((b, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1">{b.qtyFrom.toLocaleString()}+</td>
                      <td className="px-2 py-1 text-right font-mono">${b.unitPrice.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface Filters {
  mpn: boolean
  category: boolean
  value: boolean
  package: boolean
  voltageRating: boolean
  tolerance: boolean
}

function SaveLinkDialog({ result, sourceItem, onSaved, onCancel, onSelectTempAlt }: {
  result: LookupResult
  sourceItem: Item
  onSaved: () => void
  onCancel: () => void
  onSelectTempAlt?: (item: Item) => void
}) {
  const pathname = usePathname()
  const isProductPage = pathname.includes('/products/')
  const createItem = useCreateItem()
  const link = useLinkAlternative()
  const [form, setForm] = useState({
    stableId:     genStableId(result.mpn ?? 'ALT'),
    partNumber:   result.mpn ?? '',
    manufacturer: result.manufacturer ?? '',
    category:     sourceItem.category ?? '',
    package:      result.package ?? sourceItem.package ?? '',
    value:        result.value ?? sourceItem.value ?? '',
    voltageRating:result.voltageRating ?? sourceItem.voltageRating ?? '',
    tolerance:    result.tolerance ?? sourceItem.tolerance ?? '',
    stockQty:     '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const src = result.source as 'lcsc' | 'mouser' | 'digikey' | 'other'

  async function handleSave() {
    if (!form.stableId.trim() || !form.partNumber.trim()) {
      setError('Stable ID and Part Number required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const spEntry: SupplierPnEntry = {
        pn: result.mpn ?? null,
        price: result.price ?? null,
        moq: result.moq ?? null,
        priceBreaks: result.priceBreaks ?? null,
        url: result.url ?? null,
        availability: result.availability ?? null,
        quantity_available: result.quantity_available ?? null,
      }
      const spMap: SupplierPricesMap = { [src]: spEntry }
      const payload: Partial<Item> = {
        stableId:      form.stableId.trim(),
        partNumber:    form.partNumber.trim(),
        manufacturer:  form.manufacturer.trim() || undefined,
        category:      form.category.trim() || undefined,
        package:       form.package.trim() || undefined,
        value:         form.value.trim() || undefined,
        voltageRating: form.voltageRating.trim() || undefined,
        tolerance:     form.tolerance.trim() || undefined,
        priceMin:      result.price ?? undefined,
        priceCurrency: 'USD',
        stockQty:      form.stockQty ? Number(form.stockQty) : undefined,
        suppliers:     src.toUpperCase(),
        links:         result.datasheet ?? result.url ?? undefined,
        supplierPrices: JSON.stringify(spMap),
      }
      await createItem.mutateAsync(payload)
      await link.mutateAsync({ stableId: sourceItem.stableId, targetId: form.stableId.trim() })
      toast.success(`Saved & linked ${form.partNumber}`)
      onSaved()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err?.response?.data?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleUseTempAlt() {
    if (!form.stableId.trim() || !form.partNumber.trim()) {
      setError('Stable ID and Part Number required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const spEntry: SupplierPnEntry = {
        pn: result.mpn ?? null,
        price: result.price ?? null,
        moq: result.moq ?? null,
        priceBreaks: result.priceBreaks ?? null,
        url: result.url ?? null,
        availability: result.availability ?? null,
        quantity_available: result.quantity_available ?? null,
      }
      const spMap: SupplierPricesMap = { [src]: spEntry }
      const payload: Partial<Item> = {
        stableId:      form.stableId.trim(),
        partNumber:    form.partNumber.trim(),
        manufacturer:  form.manufacturer.trim() || undefined,
        category:      form.category.trim() || undefined,
        package:       form.package.trim() || undefined,
        value:         form.value.trim() || undefined,
        voltageRating: form.voltageRating.trim() || undefined,
        tolerance:     form.tolerance.trim() || undefined,
        priceMin:      result.price ?? undefined,
        priceCurrency: 'USD',
        stockQty:      form.stockQty ? Number(form.stockQty) : undefined,
        suppliers:     src.toUpperCase(),
        links:         result.datasheet ?? result.url ?? undefined,
        supplierPrices: JSON.stringify(spMap),
      }
      
      // DO NOT save to DB. Just pass the full data back to the frontend state.
      if (onSelectTempAlt) {
        onSelectTempAlt({ ...payload, stableId: form.stableId.trim() });
      }
      onSaved(); // Close the dialog
    } catch {
      setError('Failed to use temporary alternative')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold">Save & Link Alternative</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Will be linked to <span className="font-mono text-foreground">{sourceItem.stableId}</span>
            </p>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-accent text-muted-foreground">
            <X size={14} />
          </button>
        </div>

        {/* Supplier stock info */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-3 text-xs">
          <div className="flex-1 bg-muted/40 rounded-lg px-3 py-2 border border-border">
            <p className="text-[10px] text-muted-foreground mb-0.5">Supplier Price</p>
            <p className="font-mono font-semibold">{result.price != null ? `$${result.price.toFixed(4)}` : '—'}</p>
          </div>
          <div className="flex-1 bg-muted/40 rounded-lg px-3 py-2 border border-border">
            <p className="text-[10px] text-muted-foreground mb-0.5">Supplier Stock</p>
            <p className="font-mono font-semibold">{result.quantity_available != null ? result.quantity_available.toLocaleString() : '—'}</p>
          </div>
          <div className="flex-1 bg-muted/40 rounded-lg px-3 py-2 border border-border">
            <p className="text-[10px] text-muted-foreground mb-0.5">MOQ</p>
            <p className="font-mono font-semibold">{result.moq ?? '—'}</p>
          </div>
        </div>

        <div className="px-4 pb-3 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'stableId',     label: 'Stable ID *' },
              { key: 'partNumber',   label: 'Part Number *' },
              { key: 'manufacturer', label: 'Manufacturer' },
              { key: 'category',     label: 'Category' },
              { key: 'package',      label: 'Package' },
              { key: 'value',        label: 'Value' },
              { key: 'voltageRating',label: 'Voltage Rating' },
              { key: 'tolerance',    label: 'Tolerance' },
            ] as { key: keyof typeof form; label: string }[]).map(({ key, label }) => (
              <div key={key} className="space-y-0.5">
                <label className="text-[10px] text-muted-foreground font-medium">{label}</label>
                <input
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className={fieldCn}
                />
              </div>
            ))}
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2 shrink-0">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-accent transition-colors">
            Cancel
          </button>
          {isProductPage && (
            <button
              onClick={handleUseTempAlt}
              disabled={saving}
              className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-md font-medium hover:bg-amber-600 disabled:opacity-40 flex items-center gap-1.5"
              title="Use this item for export session only, without linking permanently"
            >
              {saving ? <RefreshCw size={11} className="animate-spin" /> : <Clock size={11} />}
              Use Temporarily
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
          >
            {saving ? <RefreshCw size={11} className="animate-spin" /> : <Link2 size={11} />}
            Save & Link
          </button>
        </div>
      </div>
    </div>
  )
}

export function AlternativesPanel({ item, onClose, onSelectTempAlt }: {
  item: Item
  onClose: () => void
  onSelectTempAlt?: (item: Item) => void
}) {
  const [supplierTab, setSupplierTab] = useState<SupplierTab>('lcsc')
  const [searchChips, setSearchChips] = useState<Filters>({
    mpn:           false,
    category:      !!item.category,
    value:         !!item.value,
    package:       !!item.package,
    voltageRating: false,
    tolerance:     false,
  })

  const { data: altData, refetch: refetchAlts } = useItemAlternatives(item.stableId)
  const unlink = useUnlinkAlternative()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [saveLinkResult, setSaveLinkResult] = useState<LookupResult | null>(null)

  const lcsc = useLcscLookup()
  const mouser = useMouserSearch()
  const digikey = useDigikeySearch()

  const stateOf = (src: SupplierTab) => src === 'lcsc' ? lcsc : src === 'mouser' ? mouser : digikey

  function buildQuery(chips: Filters): string {
    const parts = [
      chips.mpn           && item.partNumber,
      chips.category      && item.category,
      chips.value         && item.value,
      chips.package       && item.package,
      chips.voltageRating && item.voltageRating,
      chips.tolerance     && item.tolerance,
    ].filter(Boolean) as string[]
    return parts.join(' ').trim() || item.partNumber || ''
  }

  useEffect(() => {
    const kw = buildQuery(searchChips)
    if (kw) handleSupplierSearch(kw)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSupplierSearch(kw: string) {
    const q = kw.trim()
    if (!q) return
    const isLcsc = /^C\d+$/i.test(q)
    lcsc.reset(); mouser.reset(); digikey.reset()
    lcsc.search(isLcsc ? q : undefined, isLcsc ? undefined : q)
    mouser.search(q)
    digikey.search(q)
  }

  async function handleUnlink(targetId: string) {
    setPendingId(targetId)
    try {
      await unlink.mutateAsync({ stableId: item.stableId, targetId })
      refetchAlts()
    } finally {
      setPendingId(null)
    }
  }

  function toggleSearchChip(key: keyof Filters) {
    setSearchChips(prev => {
      const next = { ...prev, [key]: !prev[key] }
      const kw = buildQuery(next)
      if (kw) handleSupplierSearch(kw)
      return next
    })
  }

  function priceDiff(supplierPrice?: number | null): number | null {
    if (supplierPrice == null || item.priceMin == null) return null
    return (supplierPrice - item.priceMin) / item.priceMin
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-card border-l border-border w-full max-w-md flex flex-col shadow-xl">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-sm">Alternatives</h2>
              <p className="text-xs font-mono text-muted-foreground mt-0.5">{item.stableId}</p>
              <div className="flex gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                {item.partNumber && <span className="font-medium text-foreground">{item.partNumber}</span>}
                {item.category && <span>Cat: <span className="text-foreground">{item.category}</span></span>}
                {item.value && <span>Val: <span className="text-foreground">{item.value}</span></span>}
                {item.package && <span>Pkg: <span className="text-foreground">{item.package}</span></span>}
                {item.voltageRating && <span>VR: <span className="text-foreground">{item.voltageRating}</span></span>}
                {item.tolerance && <span>Tol: <span className="text-foreground">{item.tolerance}</span></span>}
              </div>
              {item.priceMin != null && (
                <p className="text-xs text-muted-foreground mt-0.5">Price: <PriceTag price={item.priceMin} currency={item.priceCurrency || undefined} /></p>
              )}
            </div>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-accent text-muted-foreground shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Linked alternatives chips */}
          {(altData?.alreadyLinked ?? []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/60">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Linked alternatives</p>
              <div className="flex flex-wrap gap-1.5">
                {(altData?.alreadyLinked ?? []).map(id => (
                  <span key={id} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 font-medium">
                    <span className="font-mono">{id}</span>
                    <button
                      onClick={() => handleUnlink(id)}
                      disabled={pendingId === id}
                      className="hover:text-destructive transition-colors"
                      title="Unlink"
                    >
                      {pendingId === id ? <RefreshCw size={9} className="animate-spin" /> : <X size={9} />}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Supplier search */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Search query chips */}
          <div className="px-4 py-2.5 border-b border-border shrink-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Search query</p>
              <button
                onClick={() => handleSupplierSearch(buildQuery(searchChips))}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw size={10} /> Re-search
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: 'mpn',           label: 'MPN',      val: item.partNumber },
                { key: 'category',      label: 'Category', val: item.category },
                { key: 'value',         label: 'Value',    val: item.value },
                { key: 'package',       label: 'Package',  val: item.package },
                { key: 'voltageRating', label: 'Voltage',  val: item.voltageRating },
                { key: 'tolerance',     label: 'Tolerance',val: item.tolerance },
              ] as { key: keyof Filters; label: string; val?: string | null }[]).map(({ key, label, val }) => {
                const active = searchChips[key]
                const disabled = !val
                return (
                  <button
                    key={key}
                    onClick={() => !disabled && toggleSearchChip(key)}
                    disabled={disabled}
                    title={disabled ? `Item has no ${label}` : active ? `Remove ${label} from search` : `Add ${label} to search`}
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium transition-all duration-150
                      ${disabled
                        ? 'opacity-25 cursor-not-allowed border-border text-muted-foreground'
                        : active
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-muted/40 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                      }`}
                  >
                    {label}
                    {val && <span className={`font-mono ${active ? 'opacity-80' : 'opacity-60'}`}>{val}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Supplier sub-tabs */}
          <div className="flex border-b border-border shrink-0">
            {(['lcsc', 'mouser', 'digikey'] as SupplierTab[]).map(src => {
              const st = stateOf(src)
              return (
                <button
                  key={src}
                  onClick={() => setSupplierTab(src)}
                  className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${supplierTab === src ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  {SUPPLIER_LABELS[src]}
                  {st.loading && <RefreshCw size={9} className="inline ml-1 animate-spin" />}
                  {!st.loading && st.results.length > 0 && (
                    <span className="ml-1 text-[10px] bg-primary/20 text-primary rounded-full px-1.5">{st.results.length}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Supplier results */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {stateOf(supplierTab).loading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm gap-2">
                <RefreshCw size={14} className="animate-spin" /> Searching…
              </div>
            ) : stateOf(supplierTab).error ? (
              <div className="flex items-center justify-center h-32 text-sm text-destructive/80 text-center px-4">
                {stateOf(supplierTab).error}
              </div>
            ) : stateOf(supplierTab).results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-1">
                <p>No results from {SUPPLIER_LABELS[supplierTab]}</p>
                <p className="text-xs">Try a different keyword</p>
              </div>
            ) : (
              <>
                {item.priceMin != null && (
                  <p className="text-xs text-muted-foreground">
                    Current price <span className="text-foreground font-mono">${item.priceMin.toFixed(4)}</span>
                  </p>
                )}
                {stateOf(supplierTab).results.slice(0, 10).map((r, i) => (
                  <SupplierResultCard
                    key={i}
                    result={r}
                    priceDiff={priceDiff(r.price)}
                    onSaveLink={() => setSaveLinkResult(r)}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {saveLinkResult && (
        <SaveLinkDialog
          result={saveLinkResult}
          sourceItem={item}
          onSaved={() => { setSaveLinkResult(null); refetchAlts(); }}
          onCancel={() => setSaveLinkResult(null)}
          onSelectTempAlt={onSelectTempAlt}
        />
      )}
    </div>
  )
}

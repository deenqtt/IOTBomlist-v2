'use client'

import { useState, useCallback } from 'react'
import { useLcscLookup, useMouserSearch, useDigikeySearch, LookupResult } from '@/hooks/usePriceLookup'
import { useCreateItem, useItemMetaAll } from '@/hooks/useItems'
import type { Item, SupplierPricesMap, SupplierPnEntry } from '@/types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Search, RefreshCw, Check, ChevronRight, ChevronLeft, AlertTriangle, ExternalLink, X,
} from 'lucide-react'
import api from '@/lib/api'

type Step = 'search' | 'pick' | 'details'
type Source = 'lcsc' | 'mouser' | 'digikey' | 'other'

interface DuplicateInfo {
  stableId: string
  partNumber: string
  manufacturer: string
}

interface SelectedPns {
  lcsc: LookupResult | null
  mouser: LookupResult | null
  digikey: LookupResult | null
  other: LookupResult | null
}

interface OtherForm {
  pn: string
  price: string
  moq: string
  url: string
}

const SOURCE_LABELS: Record<Source, string> = {
  lcsc: 'LCSC',
  mouser: 'Mouser',
  digikey: 'DigiKey',
  other: 'Other',
}

const SOURCE_COLORS: Record<Source, { badge: string; dot: string }> = {
  lcsc:    { badge: 'border-blue-200   bg-blue-50   text-blue-700   dark:border-blue-800   dark:bg-blue-950/40   dark:text-blue-300',   dot: 'bg-blue-500' },
  mouser:  { badge: 'border-green-200  bg-green-50  text-green-700  dark:border-green-800  dark:bg-green-950/40  dark:text-green-300',  dot: 'bg-green-500' },
  digikey: { badge: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300', dot: 'bg-orange-500' },
  other:   { badge: 'border-border bg-muted/60 text-muted-foreground dark:border-border dark:bg-muted/40 dark:text-muted-foreground',   dot: 'bg-muted-foreground/50' },
}

const STEP_LABELS: Record<Step, string> = { search: 'Search MPN', pick: 'Pick PN', details: 'Details' }
const STEPS: Step[] = ['search', 'pick', 'details']

const API_SOURCES: ('lcsc' | 'mouser' | 'digikey')[] = ['lcsc', 'mouser', 'digikey']
const ALL_SOURCES: Source[] = ['lcsc', 'mouser', 'digikey', 'other']

function ResultCard({ result, selected, onSelect }: {
  result: LookupResult
  selected: boolean
  onSelect: () => void
}) {
  const src = result.source as Source
  const colors = SOURCE_COLORS[src]
  return (
    <div
      onClick={onSelect}
      className={cn(
        'border rounded-lg p-3 cursor-pointer',
        'transition-[border-color,background-color,box-shadow] duration-150',
        'active:scale-[0.99]',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/30 shadow-sm'
          : 'border-border [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:bg-accent/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{result.mpn ?? '—'}</span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', colors.badge)}>
              {src === 'lcsc' && result.lcsc ? result.lcsc : SOURCE_LABELS[src]}
            </span>
            {selected && <Check size={12} className="text-primary" />}
          </div>
          {result.manufacturer && (
            <p className="text-xs text-muted-foreground mt-0.5">{result.manufacturer}</p>
          )}
          {result.description && (
            <p className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-2">{result.description}</p>
          )}
        </div>
        {result.url && (
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1 rounded text-muted-foreground [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-foreground transition-colors"
          >
            <ExternalLink size={12} />
          </a>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs mt-2.5 pt-2.5 border-t border-border/50">
        <div>
          <p className="text-muted-foreground text-[10px]">Price</p>
          <p className="font-mono font-semibold">{result.price != null ? `$${result.price.toFixed(4)}` : '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[10px]">MOQ</p>
          <p className="font-mono">{result.moq ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[10px]">Stock</p>
          <p className="font-mono">{result.quantity_available != null ? result.quantity_available.toLocaleString() : '—'}</p>
        </div>
      </div>
    </div>
  )
}

function genStableId(mpn: string): string {
  const slug = mpn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8)
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${slug}-${rand}`
}

const fieldInputCn = cn(
  'w-full px-3 py-2 text-sm border border-input rounded-md bg-background',
  'placeholder:text-muted-foreground/60',
  'focus:outline-none focus:ring-2 focus:ring-ring',
  'transition-shadow duration-150',
)

export function AddItemSearchModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated?: (item: Item) => void
}) {
  const [step, setStep] = useState<Step>('search')
  const [mpn, setMpn] = useState('')
  const [mfrInput, setMfrInput] = useState('')
  const [activeTab, setActiveTab] = useState<Source>('lcsc')
  const [selected, setSelected] = useState<SelectedPns>({ lcsc: null, mouser: null, digikey: null, other: null })
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null)
  const [checkingDup, setCheckingDup] = useState(false)
  const [otherForm, setOtherForm] = useState<OtherForm>({ pn: '', price: '', moq: '', url: '' })

  const lcsc = useLcscLookup()
  const mouser = useMouserSearch()
  const digikey = useDigikeySearch()
  const createItem = useCreateItem()
  const { data: meta } = useItemMetaAll()

  const [form, setForm] = useState<Partial<Item>>({ priceCurrency: 'USD' })
  const [saveError, setSaveError] = useState('')

  const stateOf = useCallback((src: 'lcsc' | 'mouser' | 'digikey') => {
    return src === 'lcsc' ? lcsc : src === 'mouser' ? mouser : digikey
  }, [lcsc, mouser, digikey])

  async function handleSearch() {
    const q = mpn.trim()
    if (!q) return
    setCheckingDup(true)
    setDuplicate(null)
    try {
      const res = await api.get('/items', { params: { q, limit: 5 } })
      const items: Item[] = res.data?.data ?? []
      const mfr = mfrInput.trim().toLowerCase()
      const dup = items.find(i =>
        i.partNumber?.toLowerCase() === q.toLowerCase() &&
        (!mfr || i.manufacturer?.toLowerCase() === mfr)
      )
      if (dup) {
        setDuplicate({ stableId: dup.stableId, partNumber: dup.partNumber!, manufacturer: dup.manufacturer ?? '' })
        setCheckingDup(false)
        return
      }
    } catch { /* ignore */ }
    setCheckingDup(false)
    setSelected({ lcsc: null, mouser: null, digikey: null, other: null })
    setOtherForm({ pn: '', price: '', moq: '', url: '' })
    const isLcsc = /^C\d+$/i.test(q)
    lcsc.search(isLcsc ? q : undefined, isLcsc ? undefined : q)
    mouser.search(q)
    digikey.search(q)
    setStep('pick')
  }

  function handlePick(src: 'lcsc' | 'mouser' | 'digikey', result: LookupResult) {
    const isDeselect = selected[src]?.mpn === result.mpn && selected[src]?.source === result.source
    
    if (isDeselect) {
      setSelected(prev => ({ ...prev, [src]: null }))
      return
    }

    // If picking from LCSC and it's from search (shallow data), try to get deep data if possible
    if (src === 'lcsc' && result.lcsc && !result.value) {
      // Perform a silent deep lookup to get parameters/specs
      api.post('/lcsc/lookup', { items: [{ lcsc: result.lcsc }] })
        .then(res => {
          const deepItem = res.data?.items?.[0]
          if (deepItem) {
            setSelected(prev => ({
              ...prev,
              lcsc: { ...result, ...deepItem, source: 'lcsc' }
            }))
          } else {
            setSelected(prev => ({ ...prev, lcsc: result }))
          }
        })
        .catch(() => {
          setSelected(prev => ({ ...prev, lcsc: result }))
        })
    } else {
      setSelected(prev => ({ ...prev, [src]: result }))
    }
  }

  function handleSetOther() {
    if (!otherForm.pn.trim()) return
    const result: LookupResult = {
      mpn: otherForm.pn.trim(),
      price: otherForm.price ? Number(otherForm.price) : null,
      moq: otherForm.moq ? Number(otherForm.moq) : null,
      url: otherForm.url.trim() || null,
      source: 'other',
    }
    setSelected(prev => ({ ...prev, other: result }))
  }

  function handleClearOther() {
    setSelected(prev => ({ ...prev, other: null }))
  }

  function handleProceedToDetails() {
    const allSelected = ALL_SOURCES.map(s => selected[s]).filter(Boolean) as LookupResult[]
    
    // metaSource: Mouser/DigiKey often have cleaner manufacturer names/categories than LCSC
    const metaSource = selected.mouser ?? selected.digikey ?? selected.lcsc ?? selected.other ?? null
    // best: original priority for MPN/Datasheet (LCSC > Mouser > DigiKey)
    const best = selected.lcsc ?? selected.mouser ?? selected.digikey ?? selected.other ?? null
    
    // specSource: find the source that actually has technical specs
    const specSource = allSelected.find(r => r.value || r.tolerance || r.package || r.voltageRating) ?? best

    // Data Merging Logic:
    // 1. Description: Pick the longest one available
    const allDescs = allSelected.map(r => r.description).filter(Boolean) as string[]
    const longestDesc = allDescs.sort((a, b) => b.length - a.length)[0] || ''

    // 2. Category: Pick the most specific (usually longest string)
    const allCats = allSelected.map(r => r.category).filter(Boolean) as string[]
    const bestCat = allCats.sort((a, b) => b.length - a.length)[0] || metaSource?.category || ''

    // 3. Datasheet: Prefer PDF links
    const datasheet = allSelected.find(r => r.datasheet?.toLowerCase().includes('.pdf'))?.datasheet 
      || allSelected.find(r => r.datasheet)?.datasheet 
      || best?.datasheet 
      || best?.url 
      || ''

    const prices = allSelected.map(r => r.price).filter((p): p is number => p != null)
    const minPrice = prices.length ? Math.min(...prices) : undefined
    const supplierNames = ALL_SOURCES.filter(s => selected[s]).map(s => SOURCE_LABELS[s]).join(';')
    
    // Prefer actual MPN from supplier result over user-typed input (user may type a C-code like C9807)
    const resolvedMpn = best?.mpn?.trim() || mpn.trim()
    
    setForm({
      priceCurrency: 'USD',
      stableId: genStableId(resolvedMpn),
      partNumber: resolvedMpn,
      manufacturer: mfrInput.trim() || metaSource?.manufacturer || best?.manufacturer || '',
      productName: longestDesc.slice(0, 100).trim(),
      priceMin: minPrice,
      suppliers: supplierNames || '',
      links: datasheet,
      category: bestCat,
      value: specSource?.value || '',
      voltageRating: specSource?.voltageRating || '',
      tolerance: specSource?.tolerance || '',
      package: specSource?.package || '',
    })
    setStep('details')
  }

  async function handleSave() {
    setSaveError('')
    if (!form.stableId?.trim()) { setSaveError('Stable ID is required'); return }
    if (!form.partNumber?.trim()) { setSaveError('Part Number is required'); return }
    const spMap: SupplierPricesMap = {}
    for (const src of ALL_SOURCES) {
      const r = selected[src]
      if (r) {
        // For LCSC: store C-code (r.lcsc) as pn so Price Lookup can find it later
        // For others: store MPN
        const pnToStore = src === 'lcsc' ? (r.lcsc ?? r.mpn ?? null) : (r.mpn ?? null)
        const entry: SupplierPnEntry = {
          pn: pnToStore,
          price: r.price ?? null,
          moq: r.moq ?? null,
          priceBreaks: src !== 'other' ? (r.priceBreaks ?? null) : null,
          url: r.url ?? null,
          availability: src !== 'other' ? (r.availability ?? null) : null,
          quantity_available: src !== 'other' ? (r.quantity_available ?? null) : null,
        }
        spMap[src] = entry
      }
    }
    const payload: Partial<Item> = {
      ...form,
      supplierPrices: Object.keys(spMap).length ? JSON.stringify(spMap) : undefined,
    }
    try {
      const item = await createItem.mutateAsync(payload)
      onCreated?.(item)
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; error?: string } } }
      setSaveError(e?.response?.data?.message ?? e?.response?.data?.error ?? 'Failed to save item')
    }
  }

  const anySearchRunning = lcsc.loading || mouser.loading || digikey.loading
  const anyApiResults = API_SOURCES.some(s => stateOf(s).results.length > 0)
  const anySelected = ALL_SOURCES.some(s => selected[s] !== null)
  const currentStepIdx = STEPS.indexOf(step)

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl flex flex-col" hideClose>
        {/* Header with step indicator */}
        <DialogHeader className="pr-10">
          <DialogTitle>Add Component</DialogTitle>
          <div className="flex items-center gap-1.5 mt-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200',
                  i < currentStepIdx
                    ? 'bg-primary/10 text-primary'
                    : step === s
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground',
                )}>
                  <span className={cn(
                    'w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                    i < currentStepIdx ? 'bg-primary text-primary-foreground' : '',
                  )}>
                    {i < currentStepIdx ? <Check size={9} /> : i + 1}
                  </span>
                  {STEP_LABELS[s]}
                </div>
                {i < 2 && <div className={cn('w-4 h-px', i < currentStepIdx ? 'bg-primary/40' : 'bg-border')} />}
              </div>
            ))}
          </div>
        </DialogHeader>

        {/* Close button */}
        <button
          onClick={onClose}
          className={cn(
            'absolute right-4 top-4 rounded-md p-1',
            'text-muted-foreground opacity-70',
            '[@media(hover:hover)]:hover:opacity-100 [@media(hover:hover)]:hover:bg-accent',
            'transition-[opacity,background-color] duration-150 active:scale-[0.93]',
          )}
        >
          ×
        </button>

        {/* STEP 1 — Search MPN */}
        {step === 'search' && (
          <div className="p-6 flex flex-col gap-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Manufacturer Part Number *</label>
                <input
                  value={mpn}
                  onChange={e => { setMpn(e.target.value); setDuplicate(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="e.g. LM358, C7972, 100nF..."
                  autoFocus
                  className={fieldInputCn}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Manufacturer (optional)</label>
                <input
                  value={mfrInput}
                  onChange={e => setMfrInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="e.g. Texas Instruments, Murata..."
                  className={fieldInputCn}
                />
              </div>
            </div>

            {duplicate && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Component already exists</p>
                  <p className="text-xs mt-0.5 text-amber-600/80 dark:text-amber-400/80">
                    {duplicate.partNumber} {duplicate.manufacturer && `(${duplicate.manufacturer})`} → <span className="font-mono">{duplicate.stableId}</span>
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={handleSearch}
              disabled={!mpn.trim() || checkingDup}
              className={cn(
                'flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium',
                'bg-primary text-primary-foreground rounded-md',
                '[@media(hover:hover)]:hover:opacity-90',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'active:scale-[0.98] transition-transform duration-100',
              )}
            >
              {checkingDup
                ? <><RefreshCw size={14} className="animate-spin" /> Checking for duplicates...</>
                : <><Search size={14} /> Search LCSC, Mouser & DigiKey</>
              }
            </button>
          </div>
        )}

        {/* STEP 2 — Pick PN */}
        {step === 'pick' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Source tabs */}
            <div className="flex border-b border-border shrink-0 px-1 pt-1 gap-0.5">
              {ALL_SOURCES.map(src => {
                const isApi = src !== 'other'
                const st = isApi ? stateOf(src as 'lcsc' | 'mouser' | 'digikey') : null
                const colors = SOURCE_COLORS[src]
                return (
                  <button
                    key={src}
                    onClick={() => setActiveTab(src)}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-t-md',
                      'transition-[background-color,color] duration-150',
                      activeTab === src
                        ? 'bg-background border border-b-background border-border text-foreground -mb-px'
                        : 'text-muted-foreground [@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:hover:bg-accent/50',
                    )}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
                    {SOURCE_LABELS[src]}
                    {st?.loading && <RefreshCw size={9} className="animate-spin opacity-70" />}
                    {st && !st.loading && st.results.length > 0 && (
                      <span className="bg-primary/15 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                        {st.results.length}
                      </span>
                    )}
                    {selected[src] && <Check size={10} className="text-primary" />}
                  </button>
                )
              })}
            </div>

            {/* Results area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 min-h-[240px] max-h-[340px]">

              {/* Other — manual form */}
              {activeTab === 'other' && (
                <div className="flex flex-col gap-4">

                  {/* Quick-search section */}
                  <div className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-2.5">
                    <div className="flex items-center gap-1.5">
                      <Search size={11} className="text-muted-foreground/60" />
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Don&apos;t have the link? Search first:
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={mpn.trim() ? `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(mpn.trim())}` : 'https://www.tokopedia.com'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'flex items-center justify-center gap-2 py-2 px-3 rounded-md border text-xs font-semibold',
                          'border-green-300 bg-green-50 text-green-700',
                          'dark:border-green-800 dark:bg-green-950/30 dark:text-green-400',
                          '[@media(hover:hover)]:hover:bg-green-100 dark:[@media(hover:hover)]:hover:bg-green-900/40',
                          'transition-colors duration-150 active:scale-[0.97]',
                        )}
                      >
                        <ExternalLink size={12} />
                        Search on Tokopedia
                        {mpn.trim() && (
                          <span className="font-mono text-[10px] opacity-70 truncate max-w-[60px]">&quot;{mpn.trim()}&quot;</span>
                        )}
                      </a>
                      <a
                        href={mpn.trim() ? `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(mpn.trim())}` : 'https://www.aliexpress.com'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'flex items-center justify-center gap-2 py-2 px-3 rounded-md border text-xs font-semibold',
                          'border-orange-300 bg-orange-50 text-orange-700',
                          'dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400',
                          '[@media(hover:hover)]:hover:bg-orange-100 dark:[@media(hover:hover)]:hover:bg-orange-900/40',
                          'transition-colors duration-150 active:scale-[0.97]',
                        )}
                      >
                        <ExternalLink size={12} />
                        Search on AliExpress
                        {mpn.trim() && (
                          <span className="font-mono text-[10px] opacity-70 truncate max-w-[60px]">&quot;{mpn.trim()}&quot;</span>
                        )}
                      </a>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                      Click → find product → copy URL → paste below
                    </p>
                  </div>

                  {/* Form fields — URL first */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[10px] font-semibold text-foreground/70 uppercase tracking-wide">
                        Product URL <span className="text-primary">*</span>
                      </label>
                      <input
                        type="url"
                        value={otherForm.url}
                        onChange={e => setOtherForm(f => ({ ...f, url: e.target.value }))}
                        placeholder="Paste Tokopedia / AliExpress / any supplier URL..."
                        className={fieldInputCn}
                        autoFocus
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Name / Part Number *</label>
                      <input
                        value={otherForm.pn}
                        onChange={e => setOtherForm(f => ({ ...f, pn: e.target.value }))}
                        placeholder="e.g. 100nF 50V 0402 Capacitor"
                        className={fieldInputCn}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Price (USD)</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={otherForm.price}
                        onChange={e => setOtherForm(f => ({ ...f, price: e.target.value }))}
                        placeholder="0.0500"
                        className={fieldInputCn}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">MOQ</label>
                      <input
                        type="number"
                        min="1"
                        value={otherForm.moq}
                        onChange={e => setOtherForm(f => ({ ...f, moq: e.target.value }))}
                        placeholder="10"
                        className={fieldInputCn}
                      />
                    </div>
                  </div>

                  {selected.other ? (
                    <div className={cn(
                      'flex items-center justify-between gap-2 p-3 rounded-lg',
                      'border border-primary/30 bg-primary/5',
                    )}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Check size={13} className="text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{selected.other.mpn}</p>
                          <p className="text-xs text-muted-foreground">
                            {selected.other.price != null ? `$${selected.other.price.toFixed(4)}` : 'No price'}
                            {selected.other.moq ? ` · MOQ ${selected.other.moq}` : ''}
                            {selected.other.url && (
                              <> · <a href={selected.other.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 [@media(hover:hover)]:hover:text-foreground transition-colors">link</a></>
                            )}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleClearOther}
                        className="p-1 rounded text-muted-foreground [@media(hover:hover)]:hover:text-destructive [@media(hover:hover)]:hover:bg-destructive/10 transition-colors shrink-0"
                        title="Clear other supplier"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleSetOther}
                      disabled={!otherForm.pn.trim()}
                      className={cn(
                        'flex items-center justify-center gap-2 w-full py-2 text-sm font-medium',
                        'border border-border rounded-md',
                        '[@media(hover:hover)]:hover:bg-accent',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                        'active:scale-[0.98] transition-transform duration-100',
                      )}
                    >
                      <Check size={13} />
                      Set as Other Supplier
                    </button>
                  )}
                </div>
              )}

              {/* LCSC / Mouser / DigiKey results */}
              {activeTab !== 'other' && (() => {
                const st = stateOf(activeTab as 'lcsc' | 'mouser' | 'digikey')
                if (st.loading) return (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm gap-2">
                    <RefreshCw size={14} className="animate-spin" /> Searching {SOURCE_LABELS[activeTab]}...
                  </div>
                )
                if (st.error) return (
                  <div className="flex items-center justify-center h-full text-sm text-destructive/80 text-center px-4">
                    {st.error}
                  </div>
                )
                if (st.results.length === 0) return (
                  <div className="flex flex-col items-center justify-center h-full gap-1.5 text-muted-foreground">
                    <span className="text-sm">No results from {SOURCE_LABELS[activeTab]}</span>
                    {activeTab === 'lcsc' && (
                      <span className="text-xs text-center max-w-56 text-muted-foreground/70">
                        Try searching by MPN or keyword. C-code lookup (e.g. C7972) is recommended for exact matches.
                      </span>
                    )}
                  </div>
                )
                return st.results.slice(0, 10).map((r, i) => (
                  <ResultCard
                    key={i}
                    result={r}
                    selected={selected[activeTab as 'lcsc' | 'mouser' | 'digikey']?.mpn === r.mpn}
                    onSelect={() => handlePick(activeTab as 'lcsc' | 'mouser' | 'digikey', r)}
                  />
                ))
              })()}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border shrink-0 flex items-center justify-between gap-3">
              <div className="flex gap-1.5 flex-wrap min-w-0">
                {ALL_SOURCES.map(src => selected[src] && (
                  <span key={src} className={cn('text-[10px] px-2 py-0.5 rounded border font-medium', SOURCE_COLORS[src].badge)}>
                    {SOURCE_LABELS[src]}: {selected[src]!.mpn}
                  </span>
                ))}
                {!anySelected && (
                  <span className="text-xs text-muted-foreground">Select at least 1 supplier PN</span>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setStep('search')}
                  className={cn(
                    'px-3 py-1.5 text-xs border border-border rounded-md',
                    '[@media(hover:hover)]:hover:bg-accent',
                    'active:scale-[0.97] transition-transform duration-100',
                    'flex items-center gap-1',
                  )}
                >
                  <ChevronLeft size={13} /> Back
                </button>
                <button
                  onClick={handleProceedToDetails}
                  disabled={!anySelected && !anyApiResults}
                  className={cn(
                    'px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md font-medium',
                    '[@media(hover:hover)]:hover:opacity-90',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                    'active:scale-[0.97] transition-transform duration-100',
                    'flex items-center gap-1',
                  )}
                >
                  {anySearchRunning && <RefreshCw size={11} className="animate-spin" />}
                  Continue <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 — Details */}
        {step === 'details' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-5">
              {/* Selected PNs + supplier stock summary */}
              <div className="flex gap-2 flex-wrap mb-4">
                {ALL_SOURCES.map(src => {
                  const r = selected[src]
                  if (!r) return null
                  return (
                    <div key={src} className={cn('flex flex-col gap-0.5 text-[10px] px-2.5 py-1.5 rounded-lg border font-medium', SOURCE_COLORS[src].badge)}>
                      <span>{SOURCE_LABELS[src]}: {r.mpn}</span>
                      <div className="flex gap-2 opacity-80">
                        {r.price != null && <span>${r.price.toFixed(4)}</span>}
                        {r.quantity_available != null && (
                          <span className={r.quantity_available === 0 ? 'text-red-500' : r.quantity_available < 100 ? 'text-amber-500' : ''}>
                            Stock: {r.quantity_available.toLocaleString()}
                          </span>
                        )}
                        {r.moq != null && <span>MOQ: {r.moq}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: 'stableId',     label: 'Stable ID *',        required: true },
                  { key: 'partNumber',   label: 'Part Number MFR *',  required: true },
                  { key: 'manufacturer', label: 'Manufacturer' },
                  { key: 'productName',  label: 'Product Name' },
                  { key: 'category',     label: 'Category',           isCategory: true },
                  { key: 'package',      label: 'Package' },
                  { key: 'value',        label: 'Value' },
                  { key: 'voltageRating',label: 'Voltage Rating' },
                  { key: 'tolerance',    label: 'Tolerance' },
                  { key: 'priceMin',     label: 'Price Min (USD)',     type: 'number' },
                  { key: 'stockQty',     label: 'Stock Qty',           type: 'number' },
                  { key: 'whLocation',   label: 'WH Location' },
                  { key: 'links',        label: 'Datasheet / Link',    span2: true },
                ] as Array<{ key: string; label: string; type?: string; required?: boolean; span2?: boolean; isCategory?: boolean }>).map(
                  ({ key, label, type, required, span2, isCategory }) => (
                    <div key={key} className={cn('space-y-1', span2 && 'col-span-2')}>
                      <label className="text-xs font-medium text-muted-foreground">{label}</label>
                      {isCategory ? (
                        <Select
                          value={(form[key as keyof Item] as string) || '__none__'}
                          onValueChange={v => setForm(f => ({ ...f, [key]: v === '__none__' ? '' : v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="— Select Category —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {meta?.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <input
                          type={type || 'text'}
                          required={required}
                          value={(form[key as keyof Item] as string | number) ?? ''}
                          onChange={e => setForm(f => ({
                            ...f,
                            [key]: type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value,
                          }))}
                          className={fieldInputCn}
                        />
                      )}
                    </div>
                  )
                )}
              </div>

              {saveError && (
                <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  {saveError}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border shrink-0 flex justify-between gap-2">
              <button
                onClick={() => {
                  setSelected({ lcsc: null, mouser: null, digikey: null, other: null })
                  setOtherForm({ pn: '', price: '', moq: '', url: '' })
                  setStep('pick')
                }}
                className={cn(
                  'px-3 py-1.5 text-xs border border-border rounded-md',
                  '[@media(hover:hover)]:hover:bg-accent',
                  'active:scale-[0.97] transition-transform duration-100',
                  'flex items-center gap-1',
                )}
              >
                <ChevronLeft size={13} /> Back
              </button>
              <button
                onClick={handleSave}
                disabled={createItem.isPending}
                className={cn(
                  'px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md font-medium',
                  '[@media(hover:hover)]:hover:opacity-90',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'active:scale-[0.97] transition-transform duration-100',
                  'flex items-center gap-2',
                )}
              >
                {createItem.isPending
                  ? <><RefreshCw size={12} className="animate-spin" /> Saving...</>
                  : <><Check size={13} /> Save Component</>
                }
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

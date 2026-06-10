'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSets, useDeleteSet, downloadSetBom } from '@/hooks/useSets'
import { useAllProducts } from '@/hooks/useProducts'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import api from '@/lib/api'
import { getToken } from '@/lib/auth'
import {
  Plus, Trash2, Save, RefreshCw, ArrowLeft,
  Layers, LayoutGrid, Info, Copy, Settings2, Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useSetCosts } from '@/hooks/useCosting'
import { AlertCircle } from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────

function fmt(n: number, currency: string): string {
  if (["IDR", "JPY", "KRW"].includes(currency))
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
      n,
    );
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

interface ConfigRow {
  _key: string
  productId: number
  qty: number
  op: 'set_qty' | 'add' | 'remove'
}

let _keyCounter = 0
function newKey() { return `row-${++_keyCounter}` }
function makeRow(productId: number, qty = 1, op: ConfigRow['op'] = 'set_qty'): ConfigRow {
  return { _key: newKey(), productId, qty, op }
}

export default function ProductEditPage() {
  const params = useParams()
  const router = useRouter()
  const setId = Number(params.id)

  const { refetch: refetchSets } = useSets()
  const { data: productsData } = useAllProducts()
  const deleteSetMutation = useDeleteSet()

  const products = productsData?.data ?? []

  const [rows, setRows] = useState<ConfigRow[]>([])
  const [setName, setSetName] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)

  const token = getToken() ?? ''
  const usedProductIds = new Set(rows.map(r => r.productId))
  const availableProducts = products.filter(p => !usedProductIds.has(p.id))
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)

  // Costing Data
  const { data: costs, isLoading: costsLoading, isFetching: isFetchingCosts } = useSetCosts('USD', [setId])
  const costInfo = costs?.[0]
  const [margin, setMargin] = useState<number>(25)
  const targetQuote = costInfo ? costInfo.total / (1 - margin / 100) : 0

  function handleMarginChange(val: string) {
    const n = Math.min(99, Math.max(0, Number(val) || 0))
    setMargin(n)
    api.patch(`/sets/${setId}`, { margin: n }).catch(() => {})
  }

  useEffect(() => {
    if (!setId) return
    setLoading(true)
    api.get(`/sets/${setId}`)
      .then(res => {
        const data = res.data
        const loaded: ConfigRow[] = (data.items ?? [])
          .filter((it: { op: string }) => it.op !== 'remove')
          .map((it: { mainProductId: number; qty: number; op: string }) =>
            makeRow(it.mainProductId, it.qty, it.op as ConfigRow['op'])
          )
        setRows(loaded)
        setSetName(data.name)
        setNotes(data.notes ?? '')
        if (data.margin != null) setMargin(data.margin)
        setLoading(false)
      })
      .catch(() => { setLoadError('Failed to load product'); setLoading(false) })
  }, [setId])

  function addRow(productId?: number) {
    const target = productId
      ? products.find(p => p.id === productId)
      : availableProducts[0]
    if (!target) return
    setRows(r => [...r, makeRow(target.id)])
  }

  function removeRow(key: string) {
    setRows(r => r.filter(x => x._key !== key))
  }

  function updateQty(key: string, qty: number) {
    setRows(r => r.map(x => x._key === key ? { ...x, qty } : x))
  }

  function updateProduct(key: string, productId: number) {
    setRows(r => r.map(x => x._key === key ? { ...x, productId } : x))
  }

  async function handleUpdate() {
    if (!setName.trim()) { toast.error('Product name is required'); return }
    setSaving(true)
    try {
      const items = rows.map((r, idx) => ({ mainProductId: r.productId, qty: r.qty, op: r.op, orderIndex: idx }))
      await api.patch(`/sets/${setId}`, { name: setName.trim(), notes: notes || null, items })
      await refetchSets()
      toast.success(`"${setName}" updated`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleSaveAsNew() {
    if (!setName.trim()) { toast.error('Product name is required'); return }
    setSaving(true)
    try {
      const copyName = setName.trim() + ' (Copy)'
      const items = rows.map((r, idx) => ({ mainProductId: r.productId, qty: r.qty, op: r.op, orderIndex: idx }))
      const res = await api.post('/sets', { name: copyName, notes: notes || null, items })
      await refetchSets()
      toast.success(`Product "${copyName}" created`)
      router.replace(`/sets/${res.data.id}`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to save copy. Try changing the name.')
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto w-full space-y-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <div><Skeleton className="h-8 w-64 mb-2" /><Skeleton className="h-4 w-48" /></div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24 rounded-xl" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
           <div className="lg:col-span-8 space-y-8">
             <Skeleton className="h-48 rounded-2xl" />
             <Skeleton className="h-96 rounded-2xl" />
           </div>
           <div className="lg:col-span-4">
             <Skeleton className="h-64 rounded-2xl" />
           </div>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4 py-20">
        <Layers size={48} className="text-muted-foreground/20" />
        <p className="text-lg font-bold">Failed to load product</p>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" onClick={() => router.push('/sets')} className="gap-2 rounded-xl">
          <ArrowLeft size={16} /> Back to Products
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 py-4">
      {/* ── Header Area ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push('/sets')}
            className="h-8 px-2 -ml-2 text-muted-foreground hover:text-foreground transition-all gap-1 group mb-2"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to Products
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-sm shrink-0">
              <Settings2 size={28} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight truncate">
                {setName || 'Unnamed Product'}
              </h1>
              <p className="text-sm text-muted-foreground">Edit composition and details for this hardware product</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Export BOM */}
          <div className="flex items-center gap-1 border border-border rounded-xl overflow-hidden h-12">
            <button
              onClick={() => downloadSetBom(setId, setName, 'original', token)}
              className="h-12 px-3 text-sm font-semibold flex items-center gap-2 hover:bg-muted transition-colors text-foreground"
              title="Export BOM (Original)"
            >
              <Download size={16} /> BOM
            </button>
            <div className="w-px h-6 bg-border" />
            <button
              onClick={() => downloadSetBom(setId, setName, 'alternative', token)}
              className="h-12 px-3 text-[11px] font-bold flex items-center gap-1 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Export BOM Alternative"
            >
              ALT
            </button>
            <div className="w-px h-6 bg-border" />
            <button
              onClick={() => downloadSetBom(setId, setName, 'combined', token)}
              className="h-12 px-3 text-[11px] font-bold flex items-center gap-1 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Export BOM Combined"
            >
              ALL
            </button>
          </div>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setDeleteTarget(setId)}
            className="h-12 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 gap-2"
          >
            <Trash2 size={18} />
          </Button>
          <Button 
            variant="outline"
            size="lg"
            onClick={handleSaveAsNew} 
            disabled={saving || !setName.trim()} 
            className="h-12 rounded-xl gap-2 font-semibold"
          >
            <Copy size={18} /> Save as Copy
          </Button>
          <Button 
            size="lg"
            onClick={handleUpdate} 
            disabled={saving || !setName.trim()} 
            className="h-12 px-8 rounded-xl shadow-lg shadow-primary/20 gap-2 font-bold text-base transition-all active:scale-95"
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* ── Left Column: Configuration ──────────────── */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Section 1: Basic Info */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-border/50">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <Info size={16} className="text-muted-foreground" />
              </div>
              <h2 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Basic Information</h2>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2.5">
                <Label className="text-sm font-bold flex items-center gap-1.5">
                  Product Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={setName}
                  onChange={e => setSetName(e.target.value)}
                  placeholder="e.g. Smart Gateway V3 - Full Kit"
                  className="h-12 rounded-xl border-2 font-bold text-lg px-4 focus-visible:ring-primary/20 transition-all"
                />
              </div>

              <div className="space-y-2.5">
                <Label className="text-sm font-bold">Notes / Description</Label>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Customer specific requirements..."
                  className="h-11 rounded-xl border-2"
                />
              </div>
            </div>
          </div>

          {/* Section 2: PCB Composition */}
          <div className="bg-card border border-border rounded-2xl flex flex-col shadow-sm overflow-hidden min-h-[400px]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <LayoutGrid size={16} className="text-primary" />
                </div>
                <h2 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">PCB Composition</h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-2 hover:bg-primary hover:text-white transition-all gap-1.5"
                onClick={() => addRow()}
                disabled={availableProducts.length === 0}
              >
                <Plus size={14} /> Add PCB
              </Button>
            </div>

            <div className="flex-1 p-2">
              {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                  <div className="w-20 h-20 rounded-3xl bg-muted/40 border-2 border-dashed border-border flex items-center justify-center">
                    <Layers size={32} className="text-muted-foreground/30" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-foreground">No PCBs in this product</p>
                    <p className="text-sm text-muted-foreground max-w-[280px]">
                      A product must contain at least one PCB assembly.
                    </p>
                  </div>
                  <Button 
                    variant="secondary" 
                    className="mt-2 rounded-xl px-6 h-11 font-bold shadow-sm"
                    onClick={() => addRow()} 
                    disabled={availableProducts.length === 0}
                  >
                    <Plus size={18} className="mr-2" /> Add First PCB
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {rows.map((row, i) => {
                    const product = products.find(p => p.id === row.productId)
                    return (
                      <div 
                        key={row._key} 
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border-2 border-transparent transition-all",
                          "bg-muted/10 hover:bg-muted/30 hover:border-border/50 group"
                        )}
                      >
                        <div className="w-8 h-8 rounded-full bg-background border-2 border-border flex items-center justify-center shrink-0 font-mono font-bold text-xs shadow-sm">
                          {i + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <Select
                            value={String(row.productId)}
                            onValueChange={v => updateProduct(row._key, Number(v))}
                          >
                            <SelectTrigger className="h-11 rounded-xl border-2 text-sm font-bold bg-background focus:ring-primary/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {products
                                .filter(p => p.id === row.productId || !usedProductIds.has(p.id))
                                .map(p => (
                                  <SelectItem key={p.id} value={String(p.id)} className="rounded-lg my-0.5">
                                    {p.name}
                                  </SelectItem>
                                ))
                              }
                            </SelectContent>
                          </Select>
                          {product && (
                            <div className="flex items-center gap-2 mt-1.5 px-1">
                              <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-tight py-0 bg-background">
                                {product._count?.items ?? 0} BOM Items
                              </Badge>
                              {product.slug && <span className="text-[10px] font-mono text-muted-foreground">{product.slug}</span>}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 sm:ml-auto">
                          <div className="flex items-center bg-background border-2 border-border rounded-xl h-11 p-1 shadow-sm">
                            <button
                              type="button"
                              onClick={() => updateQty(row._key, Math.max(1, row.qty - 1))}
                              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                            >
                              <span className="text-xl font-bold">−</span>
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={row.qty}
                              onChange={e => updateQty(row._key, Math.max(1, Number(e.target.value)))}
                              className="w-14 bg-transparent text-center font-mono font-bold text-lg focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateQty(row._key, row.qty + 1)}
                              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                            >
                              <span className="text-xl font-bold">+</span>
                            </button>
                          </div>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest w-8">qty</span>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 sm:opacity-0 group-hover:opacity-100 transition-all text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                          onClick={() => removeRow(row._key)}
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    )
                  })}

                  {availableProducts.length > 0 && (
                    <button
                      onClick={() => addRow()}
                      className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all font-bold text-sm"
                    >
                      <Plus size={16} /> Add another PCB Assembly
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right Column: Summary Sticky ─────────────── */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 space-y-6">
            <div className="relative overflow-hidden bg-card border border-border rounded-3xl p-6 shadow-sm group">
              {/* Decorative background element */}
              <div className="absolute -right-8 -top-8 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
              
              <h3 className="font-bold text-xs uppercase tracking-[0.15em] text-muted-foreground mb-6 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-primary rounded-full" />
                Product Summary
              </h3>
              
              <div className="space-y-5 relative z-10">
                <div className="flex justify-between items-end">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">PCB Assemblies</p>
                    <p className="text-sm font-medium">Unique Types</p>
                  </div>
                  <span className="text-3xl font-black tabular-nums tracking-tight">{rows.length}</span>
                </div>

                <div className="flex justify-between items-end">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-primary">Total Production</p>
                    <p className="text-sm font-medium">Accumulated Units</p>
                  </div>
                  <span className="text-3xl font-black tabular-nums tracking-tight text-primary">{totalQty}</span>
                </div>

                <div className="pt-4 border-t border-border/50">
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estimated Total Cost</p>
                      <p className="text-xs text-muted-foreground italic">Based on min market price</p>
                    </div>
                    <div className="text-right">
                      {costsLoading || isFetchingCosts ? (
                        <Skeleton className="h-8 w-32 ml-auto" />
                      ) : costInfo ? (
                        <div className="flex flex-col items-end">
                          <span className="text-2xl font-black tabular-nums tracking-tight text-foreground">
                            USD {fmt(costInfo.total, 'USD')}
                          </span>
                          {costInfo.missingPrices > 0 && (
                            <div className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-500/10 px-1.5 rounded-full border border-amber-500/20 uppercase tracking-tighter mt-1">
                              <AlertCircle size={8} /> {costInfo.missingPrices} missing prices
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xl font-bold text-muted-foreground/30">—</span>
                      )}
                    </div>
                  </div>

                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-3 flex items-center gap-1.5">
                    <Layers size={12} /> Composition Preview
                  </p>
                  {rows.length === 0 ? (
                    <div className="py-8 text-center bg-muted/30 rounded-2xl border border-dashed border-border/50">
                      <p className="text-xs italic text-muted-foreground">No PCBs in this product</p>
                    </div>
                  ) : (
                    <div className="max-h-[280px] overflow-auto pr-1 space-y-2 custom-scrollbar">
                      {rows.map(r => {
                        const p = products.find(it => it.id === r.productId)
                        return (
                          <div key={r._key} className="flex justify-between items-center bg-muted/40 hover:bg-muted/60 transition-colors rounded-xl px-3 py-2.5 border border-border/50">
                            <div className="min-w-0 flex-1 mr-2">
                              <p className="text-xs font-bold truncate">{p?.name || '...'}</p>
                              <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter">PCB Module</p>
                            </div>
                            <Badge variant="secondary" className="font-mono font-bold bg-background text-primary px-2 py-0.5 rounded-lg border-primary/10 shadow-sm">
                              x{r.qty}
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Target Quote Card */}
            <div className="bg-card border border-primary/20 rounded-3xl p-6 shadow-sm">
              <h3 className="font-bold text-xs uppercase tracking-[0.15em] text-primary mb-4 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-primary rounded-full" />
                Target Quote
              </h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-muted-foreground">Margin</span>
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={margin}
                      onChange={e => handleMarginChange(e.target.value)}
                      className="w-16 h-9 text-sm font-bold text-center border-2 border-border rounded-lg px-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary tabular-nums"
                    />
                    <span className="text-sm font-bold text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-border/50">
                  {costsLoading || isFetchingCosts ? (
                    <Skeleton className="h-10 w-full" />
                  ) : costInfo && costInfo.total > 0 ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Sell at</span>
                      <span className="text-3xl font-black tabular-nums tracking-tight text-primary">
                        USD {fmt(targetQuote, 'USD')}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Cost {fmt(costInfo.total, 'USD')} + {margin}% margin
                      </span>
                    </div>
                  ) : (
                    <span className="text-2xl font-bold text-muted-foreground/30">—</span>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-primary/[0.03] border border-primary/10 rounded-2xl p-4 flex gap-3 shadow-inner">
                <Info size={16} className="shrink-0 mt-0.5 text-primary/60" />
                <p className="text-[11px] leading-relaxed text-muted-foreground font-medium italic">
                  Changes made here will update the Bill of Materials for this product.
                </p>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this product?"
        description="All PCB entries in this product will be deleted. This action cannot be undone."
        onConfirm={async () => {
          if (!deleteTarget) return
          await deleteSetMutation.mutateAsync(deleteTarget)
          setDeleteTarget(null)
          toast.success('Product deleted')
          router.push('/sets')
        }}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteSetMutation.isPending}
      />
    </div>
  )
}

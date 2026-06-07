'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSets } from '@/hooks/useSets'
import { useAllProducts } from '@/hooks/useProducts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import api from '@/lib/api'
import {
  Plus, Save, RefreshCw, Trash2, ArrowLeft,
  Layers, Package, LayoutGrid, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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

export default function NewProductPage() {
  const router = useRouter()
  const { refetch: refetchSets } = useSets()
  const { data: productsData } = useAllProducts()

  const products = productsData?.data ?? []

  const [rows, setRows] = useState<ConfigRow[]>([])
  const [setName, setSetName] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const usedProductIds = new Set(rows.map(r => r.productId))
  const availableProducts = products.filter(p => !usedProductIds.has(p.id))
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)

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

  async function handleCreate() {
    if (!setName.trim()) { toast.error('Product name is required'); return }
    if (rows.length === 0) { toast.error('Add at least one PCB to this product'); return }
    setSaving(true)
    try {
      const items = rows.map((r, idx) => ({ 
        mainProductId: r.productId, 
        qty: r.qty, 
        op: r.op, 
        orderIndex: idx 
      }))
      const res = await api.post('/sets', { name: setName.trim(), notes: notes || null, items })
      await refetchSets()
      toast.success(`Product "${setName}" created`)
      router.replace(`/sets/${res.data.id}`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to create product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 py-4">
      {/* ── Header Area ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
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
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-sm">
              <Package size={28} className="text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Create New Product</h1>
              <p className="text-sm text-muted-foreground">Define a final hardware product by combining multiple PCB assemblies</p>
            </div>
          </div>
        </div>

        <Button 
          size="lg"
          onClick={handleCreate} 
          disabled={saving || !setName.trim() || rows.length === 0} 
          className="h-12 px-8 rounded-xl shadow-lg shadow-primary/20 gap-2 font-bold text-base transition-all active:scale-95"
        >
          {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
          Create Product
        </Button>
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
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground italic">Use a unique name to distinguish this product from individual PCBs.</p>
              </div>

              <div className="space-y-2.5">
                <Label className="text-sm font-bold">Notes / Description</Label>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Includes casing, screws, and external antenna..."
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
                    <p className="font-bold text-foreground">No PCBs added yet</p>
                    <p className="text-sm text-muted-foreground max-w-[280px]">
                      A product must contain at least one PCB assembly. Start by adding one below.
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
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-3 flex items-center gap-1.5">
                    <Layers size={12} /> Composition Preview
                  </p>
                  {rows.length === 0 ? (
                    <div className="py-8 text-center bg-muted/30 rounded-2xl border border-dashed border-border/50">
                      <p className="text-xs italic text-muted-foreground">No PCBs selected</p>
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

            <div className="bg-primary/[0.03] border border-primary/10 rounded-2xl p-4 flex gap-3 shadow-inner">
                <Info size={16} className="shrink-0 mt-0.5 text-primary/60" />
                <p className="text-[11px] leading-relaxed text-muted-foreground font-medium italic">
                  Review the summary carefully. This defines the final manufacturing bundle for your project.
                </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

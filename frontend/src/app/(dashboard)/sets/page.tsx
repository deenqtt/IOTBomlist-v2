'use client'

import { useState } from 'react'
import { useSets, useSetContents, useRenameSet, useDeleteSet, downloadSetBom } from '@/hooks/useSets'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/auth'
import { getToken } from '@/lib/auth'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Search, Pencil, Trash2, Download, ChevronRight,
  X, Layers, FileText, RefreshCw, Plus, Settings2, Loader2,
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

/* ─── rename modal ───────────────────────────────────────── */

function RenameModal({ product, onClose, onSave }: {
  product: { id: number; name: string }
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(product.name)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim() || name.trim() === product.name) { onClose(); return }
    setLoading(true); setError('')
    try {
      await onSave(name.trim())
      toast.success('Product renamed')
      onClose()
    } catch { setError('Rename failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <h3 className="font-semibold text-sm mb-4">Rename Product</h3>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !name.trim()}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
          >
            {loading ? <><RefreshCw size={12} className="animate-spin" /> Saving…</> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── product contents side panel ────────────────────────────── */

function ProductContentsPanel({ productId, productName, onClose }: {
  productId: number
  productName: string
  onClose: () => void
}) {
  const { data, isLoading } = useSetContents(productId)
  const token = getToken() ?? ''

  const totalPCBs = data?.length ?? 0
  const totalQty = data?.reduce((s, r) => s + r.qty, 0) ?? 0

  const BOM_MODES = [
    { mode: 'original',    label: 'Original',    desc: 'Per PCB' },
    { mode: 'combined',    label: 'Combined',    desc: 'Merged rows' },
    { mode: 'alternative', label: 'Alternative', desc: 'Alt parts'   },
  ] as const

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-card border-l border-border w-full max-w-md flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Layers size={13} className="text-primary" />
              </div>
              <h2 className="font-semibold text-sm">{productName}</h2>
            </div>
            {!isLoading && data && (
              <p className="text-xs text-muted-foreground mt-1.5 ml-9">
                {totalPCBs} PCB{totalPCBs !== 1 ? 's' : ''}
                <span className="mx-1.5 text-muted-foreground/30">·</span>
                total qty <span className="font-semibold text-foreground">{totalQty}</span>
              </p>
            )}
            {isLoading && <Skeleton className="h-3 w-32 rounded-full mt-1.5 ml-9" />}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* BOM download */}
        <div className="px-5 py-3.5 border-b border-border shrink-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Download BOM</p>
          <div className="grid grid-cols-3 gap-2">
            {BOM_MODES.map(({ mode, label, desc }) => (
              <button
                key={mode}
                onClick={() => downloadSetBom(productId, productName, mode, token)}
                className={cn(
                  'flex flex-col items-center gap-1.5 px-2 py-3 border border-border rounded-xl',
                  'hover:bg-accent hover:border-primary/30 transition-all duration-150',
                  'active:scale-[0.97]',
                )}
              >
                <Download size={14} className="text-muted-foreground" />
                <span className="text-xs font-semibold">{label}</span>
                <span className="text-[10px] text-muted-foreground">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Contents */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-0 py-2 border-b border-border/50">
                  <Skeleton className="h-3 rounded-full" style={{ width: 140 + i * 10, opacity: Math.max(0.15, 1 - i * 0.12) }} />
                  <Skeleton className="h-3 w-8 rounded-full" style={{ opacity: Math.max(0.15, 1 - i * 0.12) }} />
                </div>
              ))}
            </div>
          ) : !data?.length ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-muted/60 border border-border flex items-center justify-center">
                <Layers size={18} className="opacity-30" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Product is empty</p>
                <p className="text-xs mt-0.5 text-muted-foreground">Not yet configured in Product Configurator</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">PCB</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr
                    key={row.productId}
                    className={cn(
                      'border-b border-border/60 transition-colors duration-100',
                      '[@media(hover:hover)]:hover:bg-accent/25',
                      i % 2 !== 0 ? 'bg-muted/[0.02]' : '',
                    )}
                  >
                    <td className="px-4 py-2.5 text-xs text-muted-foreground/60 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-sm">{row.productName}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">{row.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── skeleton rows ──────────────────────────────────────── */

function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className={cn('border-b border-border', i % 2 !== 0 && 'bg-muted/[0.025]')}>
          <td className="px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Skeleton className="w-4 h-4 rounded shrink-0" style={{ opacity: Math.max(0.15, 1 - i * 0.09) }} />
              <Skeleton className="h-3.5 rounded-full" style={{ width: 140 + (i % 3) * 30, opacity: Math.max(0.15, 1 - i * 0.09) }} />
            </div>
          </td>
          <td className="px-4 py-3.5"><Skeleton className="h-5 w-20 rounded-full" style={{ opacity: Math.max(0.1, 0.6 - i * 0.07) }} /></td>
          <td className="px-4 py-3.5 text-center"><Skeleton className="h-5 w-8 rounded-full mx-auto" style={{ opacity: Math.max(0.1, 0.5 - i * 0.06) }} /></td>
          <td className="px-4 py-3.5"><Skeleton className="h-3 w-20 rounded-full" style={{ opacity: Math.max(0.1, 0.4 - i * 0.05) }} /></td>
          <td className="px-4 py-3.5"><Skeleton className="h-3 w-32 rounded-full" style={{ opacity: Math.max(0.1, 0.35 - i * 0.04) }} /></td>
          <td className="px-4 py-3.5" />
        </tr>
      ))}
    </>
  )
}

/* ─── page ───────────────────────────────────────────────── */

export default function SetsPage() {
  const { user } = useAuth()
  const admin = isAdmin(user)
  const router = useRouter()

  const { data: sets, isLoading, refetch, isFetching } = useSets()
  const renameSet = useRenameSet()
  const deleteSet = useDeleteSet()

  const [q, setQ] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)

  const filtered = (sets ?? []).filter(s =>
    !q ||
    s.name.toLowerCase().includes(q.toLowerCase()) ||
    (s.notes ?? '').toLowerCase().includes(q.toLowerCase())
  )

  // Fetch costs for visible sets
  const setIds = filtered.map(s => s.id)
  const { data: costs, isLoading: costsLoading, isFetching: isFetchingCosts } = useSetCosts('USD', setIds.length > 0 ? setIds : undefined)

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteSet.mutateAsync(deleteTarget.id)
    toast.success('Product deleted')
    setDeleteTarget(null)
    if (selectedProduct?.id === deleteTarget.id) setSelectedProduct(null)
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">

      {/* ── Page Header ────────────────────────────────── */}
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-sm">
            <Layers size={18} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight leading-none">Products</h1>
              {isLoading
                ? <Skeleton className="h-5 w-8 rounded-full" />
                : sets && (
                  <span className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                    {sets.length}
                  </span>
                )
              }
              {isFetching && !isLoading && (
                <RefreshCw size={11} className="animate-spin text-muted-foreground/50" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Final products — collections of PCB assemblies</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh" className="h-9 w-9">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </Button>
          {admin && (
            <Button onClick={() => router.push('/sets/new')} className="gap-1.5">
              <Plus size={14} /> New Product
            </Button>
          )}
        </div>
      </div>

      {/* ── Search bar ─────────────────────────────────── */}
      <div className="shrink-0 bg-muted/40 border border-border rounded-xl p-3">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search products by name or notes…"
            className={cn(
              'w-full pl-9 pr-8 h-9 text-sm border border-input rounded-lg bg-background',
              'placeholder:text-muted-foreground/40',
              'focus:outline-none focus:ring-2 focus:ring-ring transition-shadow duration-150',
            )}
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────── */}
      <div className="flex-1 overflow-auto rounded-xl border border-border shadow-sm bg-card min-h-0">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/80 backdrop-blur-sm">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">Product Name</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">Base Product</th>
              <th className="text-center px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">PCBs</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">Est. Cost</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">Created By</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">Notes</th>
              <th className="border-b border-border px-4 py-2.5 w-28" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows count={8} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                    <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border flex items-center justify-center">
                      <Layers size={22} className="opacity-25" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">
                        {q ? 'No products match your search' : 'No products yet'}
                      </p>
                      <p className="text-xs mt-1 text-muted-foreground">
                        {q ? 'Try a different search term' : 'Click "New Product" to create your first product'}
                      </p>
                    </div>
                    {q && (
                      <button
                        onClick={() => setQ('')}
                        className="text-xs px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-accent transition-colors"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : filtered.map((s, i) => {
              const costInfo = costs?.find(c => c.setId === s.id)
              return (
                <tr
                  key={s.id}
                  onClick={() => setSelectedProduct({ id: s.id, name: s.name })}
                  className={cn(
                    'border-b border-border/60 cursor-pointer group transition-colors duration-100',
                    '[@media(hover:hover)]:hover:bg-accent/25',
                    selectedProduct?.id === s.id
                      ? 'bg-primary/5 border-l-2 border-l-primary'
                      : i % 2 !== 0 ? 'bg-muted/[0.02]' : '',
                  )}
                >
                  {/* Product Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={13} className={cn(
                        'shrink-0 transition-colors',
                        selectedProduct?.id === s.id ? 'text-primary' : 'text-muted-foreground/50',
                      )} />
                      <span className={cn(
                        'font-medium text-sm',
                        selectedProduct?.id === s.id && 'text-primary',
                      )}>
                        {s.name}
                      </span>
                    </div>
                  </td>

                  {/* Base Product */}
                  <td className="px-4 py-3">
                    {s.parent
                      ? <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 rounded-md">{s.parent.name}</Badge>
                      : <span className="text-muted-foreground/30 text-xs">—</span>}
                  </td>

                  {/* PCB count */}
                  <td className="px-4 py-3 text-center">
                    <Badge variant="secondary" className="text-[10px] px-2 py-0 h-5 rounded-md tabular-nums">
                      {s._count.items}
                    </Badge>
                  </td>

                  {/* Cost Column */}
                  <td className="px-4 py-3 text-right">
                    {costsLoading || isFetchingCosts ? (
                      <div className="flex justify-end"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
                    ) : costInfo ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-mono text-[13px] font-bold text-foreground">
                          {costInfo.total > 0 ? (
                            `USD ${fmt(costInfo.total, 'USD')}`
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </span>
                        {costInfo.altTotal > 0 && costInfo.altTotal < costInfo.total && (
                          <span className="font-mono text-[10px] text-green-500 font-bold">
                            Alt: USD {fmt(costInfo.altTotal, 'USD')}
                            <span className="ml-1 opacity-70">({Math.round((1 - costInfo.altTotal / costInfo.total) * 100)}% cheaper)</span>
                          </span>
                        )}
                        {costInfo.missingPrices > 0 && (
                          <div className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-500/10 px-1.5 rounded-full border border-amber-500/20 uppercase tracking-tighter">
                            <AlertCircle size={8} /> {costInfo.missingPrices} missing
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/20 text-xs">—</span>
                    )}
                  </td>

                  {/* Created By */}
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {s.createdBy || <span className="text-muted-foreground/30">—</span>}
                  </td>

                  {/* Notes */}
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-52 truncate" title={s.notes ?? ''}>
                    {s.notes || <span className="text-muted-foreground/30">—</span>}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button
                        onClick={() => setSelectedProduct({ id: s.id, name: s.name })}
                        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground/50 hover:text-foreground transition-colors"
                        title="View contents"
                      >
                        <ChevronRight size={14} />
                      </button>
                      {admin && (
                        <>
                          <button
                            onClick={() => router.push(`/sets/${s.id}`)}
                            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground/50 hover:text-foreground transition-colors"
                            title="Edit product"
                          >
                            <Settings2 size={13} />
                          </button>
                          <button
                            onClick={() => setRenameTarget({ id: s.id, name: s.name })}
                            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground/50 hover:text-foreground transition-colors"
                            title="Rename"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>


      {/* Side panel */}
      {selectedProduct && (
        <ProductContentsPanel
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Rename modal */}
      {renameTarget && admin && (
        <RenameModal
          product={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSave={name => renameSet.mutateAsync({ id: renameTarget.id, name })}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="All configuration data inside will be deleted. This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteSet.isPending}
      />
    </div>
  )
}

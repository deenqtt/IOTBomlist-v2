'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSupersets, useUpdateSuperset, useDeleteSuperset } from '@/hooks/useSupersets'
import { useSets } from '@/hooks/useSets'
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
import {
  Plus, Trash2, Save, RefreshCw, ArrowLeft,
  Layers, FolderTree, LayoutGrid, Info, Copy, Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useProjectCosts } from '@/hooks/useCosting'
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
  setId: number
  qty: number
}

let _keyCounter = 0
function newKey() { return `row-${++_keyCounter}` }
function makeRow(setId: number, qty = 1): ConfigRow {
  return { _key: newKey(), setId, qty }
}

export default function ProjectEditPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = Number(params.id)

  const { refetch: refetchProjects } = useSupersets()
  const { data: productsData } = useSets()
  const updateSS = useUpdateSuperset()
  const deleteSS = useDeleteSuperset()

  const products = productsData ?? []

  const [rows, setRows] = useState<ConfigRow[]>([])
  const [projectName, setProjectName] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)

  const usedSetIds = new Set(rows.map(r => r.setId))
  const availableSets = products.filter(p => !usedSetIds.has(p.id))
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)

  // Costing Data
  const { data: costs, isLoading: costsLoading, isFetching: isFetchingCosts } = useProjectCosts('USD', [projectId])
  const costInfo = costs?.[0]
  const margin = 25
  const targetQuote = costInfo ? costInfo.total / (1 - margin / 100) : 0

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    api.get(`/supersets/${projectId}`)
      .then(res => {
        const data = res.data
        const loaded: ConfigRow[] = (data.items ?? [])
          .map((it: { setId: number; qty: number }) => makeRow(it.setId, it.qty))
        
        setRows(loaded)
        setProjectName(data.name)
        setNotes(data.notes ?? '')
        setLoading(false)
      })
      .catch(() => { setLoadError('Failed to load project'); setLoading(false) })
  }, [projectId])

  function addRow(setId?: number) {
    const target = setId
      ? products.find(p => p.id === setId)
      : availableSets[0]
    if (!target) return
    setRows(r => [...r, makeRow(target.id)])
  }

  function removeRow(key: string) {
    setRows(r => r.filter(x => x._key !== key))
  }

  function updateQty(key: string, qty: number) {
    setRows(r => r.map(x => x._key === key ? { ...x, qty } : x))
  }

  function updateSet(key: string, setId: number) {
    setRows(r => r.map(x => x._key === key ? { ...x, setId } : x))
  }

  async function handleUpdate() {
    if (!projectName.trim()) { toast.error('Project name is required'); return }
    setSaving(true)
    try {
      const items = rows.map(r => ({ setId: r.setId, qty: r.qty }))
      await updateSS.mutateAsync({ id: projectId, name: projectName.trim(), notes: notes || undefined, items })
      await refetchProjects()
      toast.success(`Project "${projectName}" updated`)
    } catch {
      toast.error('Failed to save changes')
    } finally { setSaving(false) }
  }

  async function handleSaveAsNew() {
    if (!projectName.trim()) { toast.error('Project name is required'); return }
    setSaving(true)
    try {
      const copyName = projectName.trim() + ' (Copy)'
      const items = rows.map(r => ({ setId: r.setId, qty: r.qty }))
      const res = await api.post('/supersets', { name: copyName, notes: notes || null, items })
      await refetchProjects()
      toast.success(`Project "${copyName}" created as copy`)
      router.replace(`/projects/${res.data.id}`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to create copy. Try changing the name.')
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto w-full space-y-8 py-4 text-blue-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <div><Skeleton className="h-8 w-64 mb-2" /><Skeleton className="h-4 w-48" /></div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-12 w-32 rounded-xl" />
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
        <FolderTree size={48} className="text-blue-500/20" />
        <p className="text-lg font-bold">Failed to load project</p>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" onClick={() => router.push('/projects')} className="gap-2 rounded-xl border-blue-200 text-blue-700">
          <ArrowLeft size={16} /> Back to Projects
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
            onClick={() => router.push('/projects')}
            className="h-8 px-2 -ml-2 text-muted-foreground hover:text-blue-600 transition-all gap-1 group mb-2"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to Projects
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shadow-sm shrink-0">
              <Settings2 size={28} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight truncate">
                {projectName || 'Unnamed Project'}
              </h1>
              <p className="text-sm text-muted-foreground">Manage products and quantities for this production project</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setDeleteTarget(projectId)}
            className="h-12 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 gap-2 px-4"
          >
            <Trash2 size={18} />
          </Button>
          <Button 
            variant="outline"
            size="lg"
            onClick={handleSaveAsNew} 
            disabled={saving || !projectName.trim()} 
            className="h-12 rounded-xl gap-2 font-semibold border-blue-200 text-blue-700"
          >
            <Copy size={18} /> Save as Copy
          </Button>
          <Button 
            size="lg"
            onClick={handleUpdate} 
            disabled={saving || !projectName.trim()} 
            className="h-12 px-8 rounded-xl shadow-lg shadow-blue-500/20 gap-2 font-bold text-base transition-all active:scale-95 bg-blue-600 hover:bg-blue-700"
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
              <h2 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Project Scope</h2>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2.5">
                <Label className="text-sm font-bold flex items-center gap-1.5">
                  Project Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="e.g. Jakarta Hub - Phase 2"
                  className="h-12 rounded-xl border-2 font-bold text-lg px-4 focus-visible:ring-blue-500/20 transition-all border-blue-100 focus-visible:border-blue-500"
                />
              </div>

              <div className="space-y-2.5">
                <Label className="text-sm font-bold">Project Notes</Label>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Regional deployment for Q3..."
                  className="h-11 rounded-xl border-2"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Product Composition */}
          <div className="bg-card border border-border rounded-2xl flex flex-col shadow-sm overflow-hidden min-h-[400px]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <LayoutGrid size={16} className="text-blue-600" />
                </div>
                <h2 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Project Composition</h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-2 hover:bg-blue-600 hover:text-white transition-all gap-1.5 border-blue-200 text-blue-700"
                onClick={() => addRow()}
                disabled={availableSets.length === 0}
              >
                <Plus size={14} /> Add Product
              </Button>
            </div>

            <div className="flex-1 p-2">
              {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                  <div className="w-20 h-20 rounded-3xl bg-muted/40 border-2 border-dashed border-border flex items-center justify-center">
                    <Layers size={32} className="text-muted-foreground/30" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-foreground">No products in this project</p>
                    <p className="text-sm text-muted-foreground max-w-[280px]">
                      A project must contain at least one product bundle.
                    </p>
                  </div>
                  <Button 
                    variant="secondary" 
                    className="mt-2 rounded-xl px-6 h-11 font-bold shadow-sm"
                    onClick={() => addRow()} 
                    disabled={availableSets.length === 0}
                  >
                    <Plus size={18} className="mr-2" /> Add First Product
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {rows.map((row, i) => {
                    const set = products.find(s => s.id === row.setId)
                    return (
                      <div 
                        key={row._key} 
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border-2 border-transparent transition-all",
                          "bg-blue-500/[0.03] hover:bg-blue-500/[0.06] hover:border-blue-200 group"
                        )}
                      >
                        <div className="w-8 h-8 rounded-full bg-background border-2 border-blue-100 flex items-center justify-center shrink-0 font-mono font-bold text-xs shadow-sm text-blue-600">
                          {i + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <Select
                            value={String(row.setId)}
                            onValueChange={v => updateSet(row._key, Number(v))}
                          >
                            <SelectTrigger className="h-11 rounded-xl border-2 text-sm font-bold bg-background focus:ring-blue-500/20 border-blue-50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {products
                                .filter(s => s.id === row.setId || !usedSetIds.has(s.id))
                                .map(s => (
                                  <SelectItem key={s.id} value={String(s.id)} className="rounded-lg my-0.5">
                                    {s.name}
                                  </SelectItem>
                                ))
                              }
                            </SelectContent>
                          </Select>
                          {set && (
                            <div className="flex items-center gap-2 mt-1.5 px-1">
                              <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-tight py-0 bg-background border-blue-200 text-blue-700">
                                {set._count?.items ?? 0} PCB Assemblies
                              </Badge>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 sm:ml-auto">
                          <div className="flex items-center bg-background border-2 border-blue-100 rounded-xl h-11 p-1 shadow-sm">
                            <button
                              type="button"
                              onClick={() => updateQty(row._key, Math.max(1, row.qty - 1))}
                              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                            >
                              <span className="text-xl font-bold">−</span>
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={row.qty}
                              onChange={e => updateQty(row._key, Math.max(1, Number(e.target.value)))}
                              className="w-14 bg-transparent text-center font-mono font-bold text-lg focus:outline-none text-blue-700"
                            />
                            <button
                              type="button"
                              onClick={() => updateQty(row._key, row.qty + 1)}
                              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
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

                  {availableSets.length > 0 && (
                    <button
                      onClick={() => addRow()}
                      className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all font-bold text-sm"
                    >
                      <Plus size={16} /> Add another Product
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
            <div className="relative overflow-hidden bg-card border border-border rounded-3xl p-6 shadow-sm group text-foreground">
              {/* Decorative background element */}
              <div className="absolute -right-8 -top-8 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors" />
              
              <h3 className="font-bold text-xs uppercase tracking-[0.15em] text-muted-foreground mb-6 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
                Project Summary
              </h3>
              
              <div className="space-y-5 relative z-10">
                <div className="flex justify-between items-end">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Product Types</p>
                    <p className="text-sm font-medium text-foreground">Included Models</p>
                  </div>
                  <span className="text-3xl font-black tabular-nums tracking-tight">{rows.length}</span>
                </div>

                <div className="flex justify-between items-end">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-blue-600">Total Deployment</p>
                    <p className="text-sm font-medium text-foreground">Accumulated Products</p>
                  </div>
                  <span className="text-3xl font-black tabular-nums tracking-tight text-blue-600">{totalQty}</span>
                </div>

                <div className="pt-4 border-t border-border/50 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estimated Cost</p>
                      <p className="text-xs text-muted-foreground italic text-foreground">Base BOM price</p>
                    </div>
                    <div className="text-right">
                      {costsLoading || isFetchingCosts ? (
                        <Skeleton className="h-7 w-28 ml-auto" />
                      ) : costInfo ? (
                        <div className="flex flex-col items-end">
                          <span className="text-xl font-black tabular-nums tracking-tight text-foreground">
                            USD {fmt(costInfo.total, 'USD')}
                          </span>
                          {costInfo.missingPrices > 0 && (
                            <div className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-500/10 px-1.5 rounded-full border border-amber-500/20 uppercase tracking-tighter mt-1">
                              <AlertCircle size={8} /> {costInfo.missingPrices} missing
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xl font-bold text-muted-foreground/30">—</span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Target Quote</p>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight">at {margin}% margin</p>
                    </div>
                    <div className="text-right">
                      {costsLoading || isFetchingCosts ? (
                        <Skeleton className="h-7 w-32 ml-auto" />
                      ) : costInfo && costInfo.total > 0 ? (
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none font-mono text-lg font-black px-3 py-1">
                          USD {fmt(targetQuote, 'USD')}
                        </Badge>
                      ) : (
                        <span className="text-xl font-bold text-muted-foreground/30">—</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-3 flex items-center gap-1.5">
                    <Layers size={12} /> Bundle Breakdown
                  </p>
                  {rows.length === 0 ? (
                    <div className="py-8 text-center bg-muted/30 rounded-2xl border border-dashed border-border/50">
                      <p className="text-xs italic text-muted-foreground">No products selected</p>
                    </div>
                  ) : (
                    <div className="max-h-[300px] overflow-auto pr-1 space-y-2 custom-scrollbar">
                      {rows.map(r => {
                        const s = products.find(it => it.id === r.setId)
                        return (
                          <div key={r._key} className="flex justify-between items-center bg-muted/40 hover:bg-muted/60 transition-colors rounded-xl px-3 py-2.5 border border-border/50">
                            <div className="min-w-0 flex-1 mr-2">
                              <p className="text-xs font-bold truncate text-foreground">{s?.name || '...'}</p>
                              <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter">Product Unit</p>
                            </div>
                            <Badge variant="secondary" className="font-mono font-bold bg-background text-blue-600 px-2 py-0.5 rounded-lg border-blue-500/10 shadow-sm">
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

            <div className="bg-blue-500/[0.03] border border-blue-500/10 rounded-2xl p-4 flex gap-3 shadow-inner">
                <Info size={16} className="shrink-0 mt-0.5 text-blue-600/60" />
                <p className="text-[11px] leading-relaxed text-muted-foreground font-medium italic">
                  Project bundles allow you to generate a master Bill of Materials (BOM) for large-scale production runs.
                </p>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete project "${projectName}"?`}
        description="All Project configuration data will be deleted. This action cannot be undone."
        onConfirm={async () => {
          if (!deleteTarget) return
          await deleteSS.mutateAsync(deleteTarget)
          setDeleteTarget(null)
          toast.success('Project deleted')
          router.push('/projects')
        }}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteSS.isPending}
      />
    </div>
  )
}

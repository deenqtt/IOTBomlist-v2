'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupersets, useSupersetContents, useDeleteSuperset, useUpdateSuperset, downloadSupersetBom } from '@/hooks/useSupersets'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin, getToken } from '@/lib/auth'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search, Pencil, Trash2, Download, X,
  ChevronRight, RefreshCw, Layers, FolderTree, Plus, FileText
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useProjectCosts, useProductCosts } from '@/hooks/useCosting'
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

function RenameModal({ project, onClose, onSave }: {
  project: { id: number; name: string }
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(project.name)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim() || name.trim() === project.name) { onClose(); return }
    setLoading(true); setError('')
    try {
      await onSave(name.trim())
      toast.success('Project renamed')
      onClose()
    } catch { setError('Rename failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <h3 className="font-semibold text-sm mb-4">Rename Project</h3>
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

/* ─── side panel ─────────────────────────────────────────── */

function ProjectContentsPanel({ id, name, onClose }: {
  id: number; name: string; onClose: () => void
}) {
  const { data, isLoading } = useSupersetContents(id)
  const token = getToken() ?? ''
  const [downloading, setDownloading] = useState(false)

  // Cost Data for PCBs in this project
  const productIds = data?.products.map(p => p.productId)
  const { data: costs, isLoading: costsLoading, isFetching: isFetchingCosts } = useProductCosts('USD', productIds && productIds.length > 0 ? productIds : undefined)

  async function handleDownload() {
    setDownloading(true)
    try { await downloadSupersetBom(id, name, token) }
    finally { setDownloading(false) }
  }

  const totalQty = data?.products.reduce((s, r) => s + r.totalQty, 0) ?? 0

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-card border-l border-border w-full max-w-lg flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                <FolderTree size={13} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="font-semibold text-sm">{name}</h2>
            </div>
            {!isLoading && data ? (
              <p className="text-xs text-muted-foreground mt-1.5 ml-9">
                <span className="font-medium text-foreground">{data.sets.length}</span> product{data.sets.length !== 1 ? 's' : ''}
                <span className="mx-1.5 text-muted-foreground/30">·</span>
                total qty <span className="font-medium text-foreground">{Math.round(totalQty)}</span>
              </p>
            ) : isLoading ? (
              <Skeleton className="h-3 w-48 rounded-full mt-1.5 ml-9" />
            ) : null}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Product composition chips */}
        {data?.sets.length ? (
          <div className="px-5 py-3.5 border-b border-border shrink-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Composition</p>
            <div className="flex flex-wrap gap-1.5">
              {data.sets.map(s => (
                <div
                  key={s.setId}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/60 border border-border rounded-full text-xs"
                >
                  <Layers size={10} className="text-muted-foreground" />
                  <span className="font-medium">{s.setName}</span>
                  <span className="text-muted-foreground/70">×{s.qty}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Download BOM */}
        <div className="px-5 py-3.5 border-b border-border shrink-0">
          <button
            onClick={handleDownload}
            disabled={downloading || !data?.products.length}
            className={cn(
              'flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-xs font-medium transition-all duration-150',
              'hover:bg-accent hover:border-primary/30 active:scale-[0.97]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {downloading
              ? <><RefreshCw size={13} className="animate-spin text-muted-foreground" /> Downloading…</>
              : <><Download size={13} className="text-muted-foreground" /> Download Project BOM (Excel) At once</>
            }
          </button>
        </div>

        {/* PCBs table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/50">
                  <Skeleton className="h-3 rounded-full" style={{ width: 150 + i * 15, opacity: Math.max(0.15, 1 - i * 0.12) }} />
                  <Skeleton className="h-3 w-10 rounded-full" style={{ opacity: Math.max(0.15, 1 - i * 0.12) }} />
                </div>
              ))}
            </div>
          ) : !data?.products.length ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-muted/60 border border-border flex items-center justify-center">
                <FolderTree size={18} className="opacity-30" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Project is empty</p>
                <p className="text-xs mt-0.5 text-muted-foreground">Edit the project to add products</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">PCB Assembly</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Unit Cost</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Qty</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((row, i) => {
                  const costInfo = costs?.find(c => c.productId === row.productId)
                  return (
                    <tr
                      key={row.productId}
                      title={row.setContributions.map(c => `${c.setName}: ${c.qty}`).join(', ')}
                      className={cn(
                        'border-b border-border/60 transition-colors duration-100',
                        '[@media(hover:hover)]:hover:bg-accent/25',
                        i % 2 !== 0 ? 'bg-muted/[0.02]' : '',
                      )}
                    >
                      <td className="px-4 py-2.5 text-xs text-muted-foreground/60 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-sm">{row.productName}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] font-bold">
                        {costsLoading || isFetchingCosts ? (
                          <Skeleton className="h-3 w-12 ml-auto" />
                        ) : costInfo ? (
                          `$${fmt(costInfo.total, 'USD')}`
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">
                        {row.totalQty % 1 === 0 ? row.totalQty : row.totalQty.toFixed(1)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── skeleton rows ──────────────────────────────────────── */

function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className={cn('border-b border-border', i % 2 !== 0 && 'bg-muted/[0.025]')}>
          <td className="px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Skeleton className="w-4 h-4 rounded shrink-0" style={{ opacity: Math.max(0.15, 1 - i * 0.1) }} />
              <Skeleton className="h-3.5 rounded-full" style={{ width: 130 + (i % 3) * 40, opacity: Math.max(0.15, 1 - i * 0.09) }} />
            </div>
          </td>
          <td className="px-4 py-3.5 text-center">
            <Skeleton className="h-5 w-8 rounded-full mx-auto" style={{ opacity: Math.max(0.1, 0.5 - i * 0.07) }} />
          </td>
          <td className="px-4 py-3.5">
            <Skeleton className="h-3 w-20 rounded-full" style={{ opacity: Math.max(0.1, 0.4 - i * 0.06) }} />
          </td>
          <td className="px-4 py-3.5">
            <Skeleton className="h-3 w-32 rounded-full" style={{ opacity: Math.max(0.1, 0.35 - i * 0.05) }} />
          </td>
          <td className="px-4 py-3.5" />
        </tr>
      ))}
    </>
  )
}

/* ─── page ───────────────────────────────────────────────── */

export default function ProjectsPage() {
  const { user } = useAuth()
  const admin = isAdmin(user)
  const router = useRouter()

  const { data: projects, isLoading, refetch, isFetching } = useSupersets()
  const updateSS = useUpdateSuperset()
  const deleteSS = useDeleteSuperset()

  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)

  const filtered = (projects ?? []).filter(ss =>
    !q ||
    ss.name.toLowerCase().includes(q.toLowerCase()) ||
    (ss.notes ?? '').toLowerCase().includes(q.toLowerCase())
  )

  // Fetch costs for visible projects
  const projectIds = filtered.map(ss => ss.id)
  const { data: costs, isLoading: costsLoading, isFetching: isFetchingCosts } = useProjectCosts('USD', projectIds.length > 0 ? projectIds : undefined)

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteSS.mutateAsync(deleteTarget.id)
    toast.success(`Project "${deleteTarget.name}" deleted`)
    setDeleteTarget(null)
    if (selected?.id === deleteTarget.id) setSelected(null)
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 p-1">

      {/* ── Page Header ────────────────────────────────── */}
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20 flex items-center justify-center shrink-0 shadow-sm">
            <FolderTree size={22} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight leading-none">Projects</h1>
              {isLoading
                ? <Skeleton className="h-5 w-8 rounded-full" />
                : projects && (
                  <span className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    {projects.length}
                  </span>
                )
              }
              {isFetching && !isLoading && (
                <RefreshCw size={11} className="animate-spin text-muted-foreground/50" />
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">High-level production projects composed of multiple products</p>
          </div>
        </div>
        
        {admin && (
          <Button onClick={() => router.push('/projects/new')} className="gap-2 shadow-lg shadow-primary/10">
            <Plus size={16} /> New Project
          </Button>
        )}
      </div>

      {/* ── Search ─────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search projects by name or notes…"
            className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
          />
        </div>
        <button
          onClick={() => refetch()}
          title="Refresh"
          className={cn(
            'h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-background',
            'text-muted-foreground hover:bg-accent hover:text-foreground',
            'active:scale-[0.93] transition-all duration-150 shadow-sm',
          )}
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Table ──────────────────────────────────────── */}
      <div className="flex-1 overflow-auto rounded-xl border border-border shadow-sm bg-card min-h-0 flex flex-col">
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted/80 backdrop-blur-sm">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Project Name</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Products</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">Est. Cost</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-primary border-b border-border">Target Quote</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Created By</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows count={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
                      <div className="w-16 h-16 rounded-3xl bg-muted/60 border border-border flex items-center justify-center">
                        <FolderTree size={28} className="opacity-25" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-foreground">
                          {q ? 'No projects match your search' : 'No projects yet'}
                        </p>
                        <p className="text-xs mt-1 text-muted-foreground">
                          {q ? 'Try a different search term' : 'Click "New Project" to start a new bundle'}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((ss, i) => {
                const costInfo = costs?.find(c => c.projectId === ss.id)
                const margin = 25 // Default 25% margin
                const targetQuote = costInfo ? costInfo.total / (1 - margin / 100) : 0

                return (
                  <tr
                    key={ss.id}
                    onClick={() => setSelected({ id: ss.id, name: ss.name })}
                    className={cn(
                      'border-b border-border/60 cursor-pointer group transition-colors duration-100',
                      '[@media(hover:hover)]:hover:bg-accent/25',
                      selected?.id === ss.id
                        ? 'bg-primary/5 border-l-2 border-l-primary'
                        : i % 2 !== 0 ? 'bg-muted/[0.02]' : '',
                    )}
                  >
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={13} className={cn(
                          'shrink-0 transition-colors',
                          selected?.id === ss.id ? 'text-primary' : 'text-muted-foreground/50',
                        )} />
                        <span className={cn('font-medium text-sm', selected?.id === ss.id && 'text-primary')}>
                          {ss.name}
                        </span>
                      </div>
                    </td>

                    {/* Products count */}
                    <td className="px-4 py-3 text-center">
                      <Badge variant="secondary" className="text-[10px] px-2 py-0 h-5 rounded-md tabular-nums font-bold">
                        {ss.items.length}
                      </Badge>
                    </td>

                    {/* Cost Column */}
                    <td className="px-4 py-3 text-right">
                      {costsLoading || isFetchingCosts ? (
                        <Skeleton className="h-4 w-16 ml-auto rounded opacity-50" />
                      ) : costInfo ? (
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-[13px] font-bold text-foreground">
                            {costInfo.total > 0 ? (
                              `USD ${fmt(costInfo.total, 'USD')}`
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </span>
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

                    {/* Target Quote Column */}
                    <td className="px-4 py-3 text-right">
                      {costsLoading || isFetchingCosts ? (
                        <Skeleton className="h-5 w-24 ml-auto rounded opacity-50" />
                      ) : costInfo && costInfo.total > 0 ? (
                        <div className="flex flex-col items-end">
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none font-mono text-[13px] font-black px-2 py-0.5">
                            USD {fmt(targetQuote, 'USD')}
                          </Badge>
                          <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-tighter mt-0.5">
                            at {margin}% margin
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/20 text-xs">—</span>
                      )}
                    </td>

                    {/* Created By */}
                    <td className="px-4 py-3 text-sm text-muted-foreground font-medium">
                      {ss.createdBy || <span className="text-muted-foreground/30">—</span>}
                    </td>

                    {/* Notes */}
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate" title={ss.notes ?? ''}>
                      {ss.notes || <span className="text-muted-foreground/30">—</span>}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <button
                          onClick={() => setSelected({ id: ss.id, name: ss.name })}
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground/50 hover:text-foreground transition-colors"
                          title="View contents"
                        >
                          <ChevronRight size={14} />
                        </button>
                        {admin && (
                          <>
                            <button
                              onClick={() => router.push(`/projects/${ss.id}`)}
                              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground/50 hover:text-foreground transition-colors"
                              title="Edit Project"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ id: ss.id, name: ss.name })}
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
      </div>

      {/* Side panel */}
      {selected && (
        <ProjectContentsPanel
          id={selected.id}
          name={selected.name}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Rename modal */}
      {renameTarget && admin && (
        <RenameModal
          project={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSave={name => updateSS.mutateAsync({ id: renameTarget.id, name })}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete project "${deleteTarget?.name}"?`}
        description="All Project configuration data will be deleted. This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteSS.isPending}
      />
    </div>
  )
}

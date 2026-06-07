'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useItems, useItemMeta, useItemMetaAll, useUpdateItem, useDeleteItem, useDeleteItemsBulk } from '@/hooks/useItems'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/auth'
import { ItemFormModal } from '@/components/items/ItemFormModal'
import { AddItemSearchModal } from '@/components/items/AddItemSearchModal'
import { PriceLookupPanel } from '@/components/items/PriceLookupPanel'
import { AlternativesPanel } from '@/components/items/AlternativesPanel'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Item } from '@/types'
import {
  Search, Plus, Pencil, Trash2,
  ChevronLeft, ChevronRight, RefreshCw, Zap, GitMerge,
  Package, X, Filter, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronsLeft, ChevronsRight, Cpu, Check, FileText,
} from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ─── constants ─────────────────────────────────────────── */

const LIMITS = [25, 50, 100, 250]

const SUPPLIER_BADGE: Record<string, string> = {
  lcsc:    'border-blue-200   bg-blue-50   text-blue-700   dark:border-blue-800   dark:bg-blue-950/40   dark:text-blue-300',
  mouser:  'border-green-200  bg-green-50  text-green-700  dark:border-green-800  dark:bg-green-950/40  dark:text-green-300',
  digikey: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
  other:   'border-border bg-muted/60 text-muted-foreground',
}
const SUPPLIER_SHORT: Record<string, string> = {
  lcsc: 'LCSC', mouser: 'Mouser', digikey: 'DK', other: 'Other',
}

/* ─── column definitions (module-level, stable ref) ─────── */

const columnHelper = createColumnHelper<Item>()
const COLUMNS = [
  columnHelper.accessor('stableId',       { header: 'Stable ID',        enableSorting: true  }),
  columnHelper.accessor('partNumber',     { header: 'MPN',               enableSorting: true  }),
  columnHelper.accessor('manufacturer',   { header: 'Manufacturer',      enableSorting: true  }),
  columnHelper.accessor('category',       { header: 'Category',          enableSorting: true  }),
  columnHelper.accessor('package',        { header: 'Package',           enableSorting: true  }),
  columnHelper.accessor('value',          { header: 'Value',             enableSorting: false }),
  columnHelper.accessor('voltageRating',  { id: 'specs', header: 'Specs',enableSorting: false }),
  columnHelper.accessor('priceMin',       { id: 'price', header: 'Unit Price', enableSorting: true }),
  columnHelper.accessor('supplierPrices', { id: 'suppliers', header: 'Suppliers', enableSorting: false }),
  columnHelper.accessor('stockQty',       { id: 'stock', header: 'Market Stock', enableSorting: true }),
  columnHelper.display(                   { id: 'actions',  header: '',   enableSorting: false }),
]

const RIGHT_ALIGN_COLS = new Set(['price', 'stock'])

/* ─── small helpers ─────────────────────────────────────── */

interface SupplierEntry {
  pn: string
  price?: number
  url?: string
}

function parseSupplierPrices(raw?: string): Record<string, SupplierEntry> {
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

function SupplierPnBadges({ supplierPrices, suppliers, activeSupplier }: { supplierPrices?: string | null; suppliers?: string | null; activeSupplier?: string | null }) {
  const spMap = parseSupplierPrices(supplierPrices || undefined)
  const sources = (['lcsc', 'mouser', 'digikey', 'other'] as const).filter(s => spMap[s]?.pn)

  if (sources.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {sources.map(s => {
          const entry = spMap[s]!
          const isActive = activeSupplier === s
          const badge = (
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-md border font-semibold tracking-wide transition-colors flex items-center gap-1',
                SUPPLIER_BADGE[s],
                isActive && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                entry.url && 'cursor-pointer hover:brightness-95 active:scale-95'
              )}
              title={`${SUPPLIER_SHORT[s]}: ${entry.pn}${entry.price != null ? ` · $${entry.price!.toFixed(4)}` : ''}${isActive ? ' (Best In-Stock)' : ''}`}
            >
              {isActive && <Check size={8} strokeWidth={3} className="animate-in zoom-in duration-300" />}
              {SUPPLIER_SHORT[s]}
            </span>
          )

          if (entry.url) {
            return (
              <a key={s} href={entry.url} target="_blank" rel="noreferrer" className="inline-flex">
                {badge}
              </a>
            )
          }
          return <div key={s}>{badge}</div>
        })}
      </div>
    )
  }

  if (!suppliers) return <span className="text-muted-foreground/30 text-xs">—</span>
  const list = suppliers.split(/[;,]/).map(s => s.trim()).filter(Boolean)
  return (
    <div className="flex flex-wrap gap-1">
      {list.map(s => <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{s}</Badge>)}
    </div>
  )
}

function StockBadge({ qty }: { qty?: number | null | string }) {
  if (qty == null || qty === '') return <span className="text-muted-foreground/30 text-xs">—</span>
  
  const numQty = Number(qty)
  if (numQty === 0) return (
    <span className="inline-flex items-center justify-center font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-600 text-white shadow-sm animate-pulse ring-2 ring-red-600 ring-offset-1 ring-offset-background">
      0
    </span>
  )
  return (
    <span className="inline-flex items-center justify-center font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-800">
      {numQty.toLocaleString()}
    </span>
  )
}

/* prettier skeleton that matches column widths */
const SKL_COLS = [
  [84, 0],  // stableId
  [144, 0], // mpn
  [96, 0],  // manufacturer
  [72, 0],  // category
  [48, 0],  // package
  [48, 0],  // value
  [88, 0],  // specs
  [64, 0],  // price
  [80, 0],  // suppliers
  [36, 0],  // stock
  [56, 0],  // actions
]

function SkeletonRows({ count = 10 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className={cn('border-b border-border', i % 2 !== 0 && 'bg-muted/[0.025]')}>
          {SKL_COLS.map(([w, w2], j) => (
            <td key={j} className="px-3 py-3">
              <Skeleton className="h-3 rounded-full" style={{ width: w, opacity: Math.max(0.15, 1 - i * 0.09) }} />
              {w2 > 0 && (
                <Skeleton className="h-2.5 rounded-full mt-1.5" style={{ width: w2, opacity: Math.max(0.1, 0.55 - i * 0.07) }} />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

const iconBtn = cn(
  'p-1.5 rounded-md transition-all duration-150 shrink-0',
  'text-muted-foreground/60 [@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:hover:bg-accent',
  'active:scale-[0.85]',
)

/* ─── page ─────────────────────────────────────────────── */

export default function ItemsPage() {
  const { user } = useAuth()
  const admin = isAdmin(user)

  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [supplier, setSupplier] = useState('')
  const [pkg, setPkg] = useState('')
  const [page, setPage] = useState(0)
  const [limit, setLimit] = useState(100)
  const [sorting, setSorting] = useState<SortingState>([])

  const debouncedQ = useDebounce(q, 300)

  const { data, isLoading, isFetching, refetch } = useItems({
    q: debouncedQ || undefined,
    category: category || undefined,
    supplier: supplier || undefined,
    package: pkg || undefined,
    skip: page * limit,
    limit,
  })

  const { data: metaAll } = useItemMetaAll()
  const { data: metaFiltered } = useItemMeta(category || undefined)

  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const deleteItemsBulk = useDeleteItemsBulk()

  const [editItem, setEditItem] = useState<Item | null>(null)
  const [lookupItem, setLookupItem] = useState<Item | null>(null)
  const [altItem, setAltItem] = useState<Item | null>(null)
  const [showAddSearch, setShowAddSearch] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)
  
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const totalPages = data ? Math.ceil(data.total / limit) : 0
  const resetPage = useCallback(() => setPage(0), [])

  function handleFilterChange<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); resetPage(); setSelectedItems(new Set()) }
  }
  function handleCategoryChange(val: string) {
    setCategory(val); setPkg(''); resetPage(); setSelectedItems(new Set())
  }
  function clearAllFilters() {
    setQ(''); setCategory(''); setSupplier(''); setPkg(''); resetPage(); setSelectedItems(new Set())
  }

  async function handleSaveEdit(formData: Partial<Item>) {
    if (!editItem) return
    await updateItem.mutateAsync({ stableId: editItem.stableId, data: formData })
    toast.success('Component updated')
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteItem.mutateAsync(deleteTarget.stableId)
    setDeleteTarget(null)
    setSelectedItems(prev => {
      const next = new Set(prev)
      next.delete(deleteTarget.stableId)
      return next
    })
    toast.success('Component deleted')
  }

  async function handleBulkDelete() {
    if (selectedItems.size === 0) return
    try {
      await deleteItemsBulk.mutateAsync(Array.from(selectedItems))
      toast.success(`${selectedItems.size} components deleted`)
      setSelectedItems(new Set())
      setShowBulkDeleteConfirm(false)
    } catch {
      toast.error('Failed to delete components')
    }
  }

  const items = useMemo(() => data?.data ?? [], [data])

  const table = useReactTable({
    data: items,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const sortedItems = table.getSortedRowModel().rows.map(r => r.original)

  const activeFilters: { label: string; clear: () => void }[] = [
    ...(q        ? [{ label: `"${q}"`,  clear: () => { setQ('');        resetPage() } }] : []),
    ...(category ? [{ label: category,  clear: () => { setCategory(''); setPkg(''); resetPage() } }] : []),
    ...(pkg      ? [{ label: pkg,       clear: () => { setPkg('');      resetPage() } }] : []),
    ...(supplier ? [{ label: supplier,  clear: () => { setSupplier(''); resetPage() } }] : []),
  ]

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">

      {/* ── Page Header ────────────────────────────────── */}
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0 shadow-sm">
            <Cpu size={19} className="text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight leading-none">Components</h1>
              {isLoading
                ? <Skeleton className="h-5 w-12 rounded-full" />
                : data && (
                  <span className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {data.total.toLocaleString()}
                  </span>
                )
              }
              {isFetching && !isLoading && (
                <RefreshCw size={11} className="animate-spin text-muted-foreground/50" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground">Electronic component inventory</span>
              {metaAll && metaAll.categories.length > 0 && (
                <>
                  <span className="text-muted-foreground/25 text-[10px]">·</span>
                  <span className="text-[11px] text-muted-foreground/70 font-medium">{metaAll.categories.length} categories</span>
                  <span className="text-muted-foreground/25 text-[10px]">·</span>
                  <span className="text-[11px] text-muted-foreground/70 font-medium">{metaAll.suppliers.length} suppliers</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => refetch()}
            title="Refresh list"
            className={cn(
              'h-9 w-9 flex items-center justify-center rounded-lg border border-border',
              'text-muted-foreground bg-background',
              '[@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-foreground',
              'active:scale-[0.93] transition-all duration-150 shadow-sm',
            )}
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
          {admin && (
            <button
              onClick={() => setShowAddSearch(true)}
              className={cn(
                'flex items-center gap-1.5 h-9 px-4 text-sm font-medium',
                'bg-primary text-primary-foreground rounded-lg shadow-sm',
                '[@media(hover:hover)]:hover:opacity-90',
                'active:scale-[0.97] transition-all duration-100',
              )}
            >
              <Plus size={14} strokeWidth={2.5} />
              Add Component
            </button>
          )}
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────────────── */}
      <div className="shrink-0 bg-muted/40 border border-border rounded-xl p-3 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
            <input
              value={q}
              onChange={e => handleFilterChange(setQ)(e.target.value)}
              placeholder="Search part number, manufacturer, ID…"
              className={cn(
                'w-full pl-9 pr-8 h-9 text-sm border border-input rounded-lg bg-background',
                'placeholder:text-muted-foreground/40',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                'transition-shadow duration-150',
              )}
            />
            {q && (
              <button
                onClick={() => { setQ(''); resetPage() }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Category */}
          <Select value={category || '__all__'} onValueChange={v => handleCategoryChange(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-44 h-9 text-sm rounded-lg bg-background">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Categories</SelectItem>
              {metaAll?.categories.map(c => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Package — cascades from category */}
          <Select value={pkg || '__all__'} onValueChange={v => handleFilterChange(setPkg)(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-36 h-9 text-sm rounded-lg bg-background">
              <SelectValue placeholder="All Packages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Packages</SelectItem>
              {metaFiltered?.packages.map(p => <SelectItem key={p} value={p!}>{p}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Supplier */}
          <Select value={supplier || '__all__'} onValueChange={v => handleFilterChange(setSupplier)(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-36 h-9 text-sm rounded-lg bg-background">
              <SelectValue placeholder="All Suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Suppliers</SelectItem>
              {metaAll?.suppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Filter size={10} /> Filtered by:
            </span>
            {activeFilters.map((f, i) => (
              <button
                key={i}
                onClick={f.clear}
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full',
                  'bg-primary/10 text-primary border border-primary/20',
                  '[@media(hover:hover)]:hover:bg-primary/20',
                  'active:scale-[0.95] transition-transform duration-100',
                )}
              >
                {f.label}
                <X size={9} strokeWidth={2.5} />
              </button>
            ))}
            <button
              onClick={clearAllFilters}
              className="text-[11px] text-muted-foreground [@media(hover:hover)]:hover:text-foreground transition-colors underline underline-offset-2"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────── */}
      <div className="flex-1 overflow-auto rounded-xl border border-border shadow-sm bg-card min-h-0">
        <table className="w-full text-sm border-collapse">

          {/* Sticky header with sortable columns */}
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/80 backdrop-blur-sm">
              {admin && (
                <th className="px-3 py-2.5 w-10 text-center border-b border-border">
                  <Checkbox 
                    checked={items.length > 0 && selectedItems.size === items.length} 
                    onCheckedChange={(v) => {
                      if (v && items.length > 0) {
                        setSelectedItems(new Set(items.map(i => i.stableId)))
                      } else {
                        setSelectedItems(new Set())
                      }
                    }} 
                    className="translate-y-[2px]" 
                  />
                </th>
              )}
              {table.getFlatHeaders().map(header => {
                const canSort = header.column.getCanSort()
                const sorted  = header.column.getIsSorted()
                const isRight = RIGHT_ALIGN_COLS.has(header.id)
                return (
                  <th
                    key={header.id}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    className={cn(
                      'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap',
                      'border-b border-border select-none',
                      isRight ? 'text-right' : 'text-left',
                      canSort ? 'cursor-pointer group' : '',
                      canSort && '[@media(hover:hover)]:hover:bg-accent/60 transition-colors duration-100',
                      sorted ? 'text-primary' : 'text-muted-foreground',
                      header.id === 'actions' ? 'w-28' : '',
                    )}
                  >
                    <span className={cn('inline-flex items-center gap-1', isRight && 'justify-end w-full')}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && (
                        <span className={cn(
                          'transition-opacity duration-100',
                          sorted ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-50',
                        )}>
                          {sorted === 'asc'  ? <ArrowUp size={10} />   :
                           sorted === 'desc' ? <ArrowDown size={10} /> :
                           <ArrowUpDown size={10} />}
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <SkeletonRows count={10} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={admin ? 12 : 11}>
                  <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
                    <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border flex items-center justify-center">
                      <Package size={22} className="opacity-30" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {activeFilters.length > 0 ? 'No components found' : 'No components yet'}
                      </p>
                      <p className="text-xs text-muted-foreground max-w-44 text-center leading-relaxed">
                        {activeFilters.length > 0
                          ? 'Try adjusting or clearing your filters'
                          : 'Add your first component to get started'}
                      </p>
                    </div>
                    {activeFilters.length > 0 && (
                      <button
                        onClick={clearAllFilters}
                        className="text-xs px-3 py-1.5 rounded-lg border border-border bg-background [@media(hover:hover)]:hover:bg-accent transition-colors"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : sortedItems.map((item, i) => (
              <tr
                key={item.stableId}
                className={cn(
                  'border-b border-border/60 group transition-colors duration-100',
                  '[@media(hover:hover)]:hover:bg-accent/25',
                  i % 2 !== 0 ? 'bg-muted/[0.02]' : '',
                  selectedItems.has(item.stableId) && 'bg-primary/5 hover:bg-primary/10'
                )}
              >
                {/* Selection Checkbox */}
                {admin && (
                  <td className="px-3 py-2.5 text-center">
                    <Checkbox 
                      checked={selectedItems.has(item.stableId)} 
                      onCheckedChange={(v) => {
                        const next = new Set(selectedItems)
                        if (v) next.add(item.stableId)
                        else next.delete(item.stableId)
                        setSelectedItems(next)
                      }} 
                      className="translate-y-[2px]" 
                    />
                  </td>
                )}

                {/* Stable ID */}
                <td className="px-3 py-2.5">
                  <span className="font-mono text-[11px] font-semibold text-primary bg-primary/5 border border-primary/15 px-1.5 py-0.5 rounded whitespace-nowrap">
                    {item.stableId}
                  </span>
                </td>

                {/* MPN */}
                <td className="px-3 py-2.5 max-w-[180px]">
                  <div className="font-semibold text-sm truncate leading-tight">{item.partNumber || '—'}</div>
                </td>

                {/* Manufacturer */}
                <td className="px-3 py-2.5 max-w-[140px]">
                  {item.manufacturer
                    ? <span className="text-xs text-muted-foreground truncate block">{item.manufacturer}</span>
                    : <span className="text-muted-foreground/25 text-xs">—</span>}
                </td>

                {/* Category */}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {item.category
                    ? <Badge variant="secondary" className="text-[10px] px-2 py-0 h-5 font-medium rounded-md">{item.category}</Badge>
                    : <span className="text-muted-foreground/25 text-xs">—</span>}
                </td>

                {/* Package */}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {item.package
                    ? <span className="text-xs font-semibold font-mono bg-muted/60 border border-border/60 px-1.5 py-0.5 rounded">{item.package}</span>
                    : <span className="text-muted-foreground/25 text-xs">—</span>}
                </td>

                {/* Value */}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {item.value
                    ? <span className="text-xs font-semibold">{item.value}</span>
                    : <span className="text-muted-foreground/25 text-xs">—</span>}
                </td>

                {/* Specs: VR + Tolerance */}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {item.voltageRating || item.tolerance ? (
                    <span className="text-[11px] text-muted-foreground">
                      {[item.voltageRating, item.tolerance].filter(Boolean).join(' · ')}
                    </span>
                  ) : <span className="text-muted-foreground/25 text-xs">—</span>}
                </td>

                {/* Unit Price */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {item.marketPrice != null ? (
                    <div className="flex items-baseline justify-end gap-1">
                      <span className="font-mono text-xs font-semibold text-primary">${item.marketPrice.toFixed(4)}</span>
                      <span className="text-muted-foreground/50 text-[10px]">{item.priceCurrency}</span>
                    </div>
                  ) : <span className="text-muted-foreground/25 text-xs">—</span>}
                </td>

                {/* Supplier PNs */}
                <td className="px-3 py-2.5">
                  <SupplierPnBadges supplierPrices={item.supplierPrices} suppliers={item.suppliers} activeSupplier={item.marketSupplier} />
                </td>

                {/* Stock */}
                <td className="px-3 py-2.5 text-right">
                  <StockBadge qty={item.marketStock} />
                </td>

                {/* Actions */}
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-0.5 justify-end opacity-30 group-hover:opacity-100 transition-opacity duration-150">
                    {item.links && (() => {
                      const urls = (item.links as string).split(/[;]/).map(u => u.trim()).filter(Boolean)
                      const datasheet = urls.find(u => u.toLowerCase().includes('pdf') || u.toLowerCase().includes('datasheet')) || urls[1]
                      return datasheet ? (
                        <a href={datasheet} target="_blank" rel="noreferrer" className={iconBtn} title="Open datasheet">
                          <FileText size={14} />
                        </a>
                      ) : null
                    })()}
                    <button
                      onClick={() => setLookupItem(item)}
                      className={cn(iconBtn, 'text-blue-500/60 [@media(hover:hover)]:hover:text-blue-500 [@media(hover:hover)]:hover:bg-blue-500/10')}
                      title="Live price lookup"
                    >
                      <Zap size={14} />
                    </button>
                    <button
                      onClick={() => setAltItem(item)}
                      className={cn(iconBtn, 'relative text-violet-500/60 [@media(hover:hover)]:hover:text-violet-500 [@media(hover:hover)]:hover:bg-violet-500/10')}
                      title="Find alternatives"
                    >
                      <GitMerge size={14} />
                      {(() => {
                        const count = (item.alternatives ?? '').split(/[;,]/).map(s => s.trim()).filter(Boolean).length
                        return count > 0 ? (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-violet-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                            {count}
                          </span>
                        ) : null
                      })()}
                    </button>
                    {admin && (
                      <>
                        <div className="w-px h-3.5 bg-border mx-0.5" />
                        <button
                          onClick={() => setEditItem(item)}
                          className={cn(iconBtn, '[@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:hover:bg-accent')}
                          title="Edit component"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(item)}
                          className={cn(iconBtn, '[@media(hover:hover)]:hover:text-destructive [@media(hover:hover)]:hover:bg-destructive/10')}
                          title="Delete component"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {admin && selectedItems.size > 0 && (
        <div className="sticky bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 mx-auto mt-auto">
          <div className="flex items-center gap-6 px-6 py-3 bg-foreground text-background rounded-2xl shadow-2xl border border-border/10 backdrop-blur-xl">
            <div className="flex items-center gap-3 border-r border-background/20 pr-6">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">{selectedItems.size}</div>
              <span className="text-sm font-bold tracking-tight">Components Selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                className="text-background hover:bg-background/10 font-bold text-xs h-9 px-3 rounded-lg transition-colors" 
                onClick={() => setSelectedItems(new Set())}
              >
                Clear
              </button>
              <button 
                className="font-bold text-xs h-9 px-4 rounded-xl shadow-lg shadow-destructive/20 bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center" 
                onClick={() => setShowBulkDeleteConfirm(true)}
              >
                <Trash2 size={14} className="mr-2" /> Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────── */}
      {!isLoading && data && data.total > 0 && (
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span>Rows:</span>
              <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); resetPage() }}>
                <SelectTrigger className="w-16 h-7 text-xs px-2 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIMITS.map(l => <SelectItem key={l} value={String(l)}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <span className="text-muted-foreground/30">·</span>
            <span className="tabular-nums text-muted-foreground/80">
              {(page * limit + 1).toLocaleString()}–{Math.min((page + 1) * limit, data.total).toLocaleString()}
              {' '}<span className="text-muted-foreground/50">of</span>{' '}
              {data.total.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <PaginationBtn onClick={() => setPage(0)} disabled={page === 0} title="First page">
              <ChevronsLeft size={13} />
            </PaginationBtn>
            <PaginationBtn onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} title="Previous page">
              <ChevronLeft size={13} />
            </PaginationBtn>
            <span className="px-2.5 py-1 text-xs text-muted-foreground tabular-nums font-medium min-w-[56px] text-center">
              {page + 1} / {totalPages}
            </span>
            <PaginationBtn onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} title="Next page">
              <ChevronRight size={13} />
            </PaginationBtn>
            <PaginationBtn onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} title="Last page">
              <ChevronsRight size={13} />
            </PaginationBtn>
          </div>
        </div>
      )}

      {/* ── Panels / Modals ────────────────────────────── */}
      {altItem && <AlternativesPanel item={altItem} onClose={() => setAltItem(null)} />}

      {showAddSearch && (
        <AddItemSearchModal
          onClose={() => setShowAddSearch(false)}
          onCreated={() => { refetch(); toast.success('Component added') }}
        />
      )}

      {lookupItem && <PriceLookupPanel item={lookupItem} onClose={() => setLookupItem(null)} />}

      <ItemFormModal
        open={!!editItem}
        item={editItem}
        onClose={() => setEditItem(null)}
        onSave={handleSaveEdit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.stableId}?`}
        description="WARNING: This action cannot be undone. This item will be permanently removed from ALL Bill of Materials."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteItem.isPending}
      />

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title={`Delete ${selectedItems.size} components?`}
        description="WARNING: This action cannot be undone. These items will be permanently removed from ALL Bill of Materials."
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
        loading={deleteItemsBulk.isPending}
      />
    </div>
  )
}

/* ─── sub-components ─────────────────────────────────────── */

function PaginationBtn({ onClick, disabled, children, title }: {
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'w-7 h-7 flex items-center justify-center text-xs rounded-lg border border-border',
        'text-muted-foreground bg-background',
        '[@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-foreground',
        'disabled:opacity-30 disabled:cursor-not-allowed',
        'active:scale-[0.88] transition-all duration-100',
      )}
    >
      {children}
    </button>
  )
}

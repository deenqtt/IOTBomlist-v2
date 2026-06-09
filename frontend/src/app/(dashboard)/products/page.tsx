'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import {
  useAllProducts,
  useDeleteProduct,
  useRenameProduct,
  useCreateProductImport,
  useAnalyzeImport,
} from '@/hooks/useProducts'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/auth'
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  LayoutGrid,
  Package,
  RefreshCw,
  FileSpreadsheet,
  UploadCloud,
  FileText,
  Filter,
  Check,
  Info,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
  X,
  ImagePlus,
} from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import api from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useProductCosts } from '@/hooks/useCosting'
import { SupplierPricesMap } from '@/types'
import { AlertCircle } from 'lucide-react'

import Image from 'next/image'

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

interface SupplierData {
  mpn?: string
  manufacturer?: string
  description?: string
  price?: number | null
  moq?: number | null
  priceBreaks?: { qtyFrom: number; qtyTo: number | null; unitPrice: number }[] | null
  package?: string | null
  category?: string | null
  value?: string | null
  voltageRating?: string | null
  tolerance?: string | null
  source?: string
  url?: string | null
  datasheet?: string | null
  availability?: string | null
  quantity_available?: number | null
  specs?: string | null
}

// ─── Missing item state type ───────────────────────────────────────────────

interface MissingItemState {
  identifier: string
  qty: number
  resolvedMpn?: string
  lcscCode?: string
  url?: string
  status: 'pending' | 'searching' | 'found' | 'not_found' | 'resolved' | 'skipped'
  supplierData?: SupplierData
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function genStableId(mpn: string): string {
  const slug = mpn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8)
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${slug}-${rand}`
}

// ─── Missing Items Review Step ─────────────────────────────────────────────

function MissingItemsStep({
  items,
  onConfirmAll,
  onSkipAll,
  onConfirmOne,
  onSkipOne,
}: {
  items: MissingItemState[]
  onConfirmAll: () => void
  onSkipAll: () => void
  onConfirmOne: (id: string) => void
  onSkipOne: (id: string) => void
}) {
  const pending = items.filter(i => ['pending', 'searching', 'found'].includes(i.status))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold">Missing Items Review</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{pending.length} items not found — searching suppliers...</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={onSkipAll}>Skip All</Button>
          <Button size="sm" className="text-xs h-8 bg-green-600 hover:bg-green-700 text-white" onClick={onConfirmAll}>
            <CheckCircle2 size={14} className="mr-1.5" /> Confirm All Found
          </Button>
        </div>
      </div>

      <div className="space-y-2 max-h-[280px] overflow-auto pr-1">
        {items.map(item => (
          <div key={item.identifier} className={cn(
            "border rounded-xl p-3 transition-all",
            item.status === "resolved" && "border-green-500/30 bg-green-500/5",
            item.status === "skipped" && "border-border/30 bg-muted/20 opacity-50",
            item.status === "not_found" && "border-destructive/30 bg-destructive/5 opacity-60",
            item.status === "found" && "border-primary/30 bg-primary/5",
            ['pending', 'searching'].includes(item.status) && "border-border bg-card",
          )}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0">
                  {item.status === "searching" && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
                  {item.status === "found" && <CheckCircle2 size={16} className="text-primary" />}
                  {item.status === "resolved" && <CheckCircle2 size={16} className="text-green-600" />}
                  {item.status === "skipped" && <SkipForward size={16} className="text-muted-foreground" />}
                  {item.status === "not_found" && <XCircle size={16} className="text-destructive" />}
                  {item.status === "pending" && <div className="w-4 h-4 rounded-full border-2 border-muted" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold">{item.identifier}</span>
                    <span className="text-[10px] text-muted-foreground">Qty: {item.qty}</span>
                  </div>
                  {item.supplierData && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {item.supplierData.manufacturer && <span className="font-medium text-foreground">{item.supplierData.manufacturer} </span>}
                      {item.supplierData.description}
                      {item.supplierData.price && <span className="text-primary ml-2 font-bold">${item.supplierData.price.toFixed(4)}</span>}
                    </p>
                  )}
                  {item.status === "not_found" && <p className="text-[11px] text-destructive mt-0.5">Not found in any supplier</p>}
                  {item.status === "resolved" && <p className="text-[11px] text-green-600 mt-0.5">Added to database</p>}
                </div>
              </div>
              {item.status === "found" && (
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => onSkipOne(item.identifier)}>Skip</Button>
                  <Button size="sm" className="h-7 text-[11px] bg-primary" onClick={() => onConfirmOne(item.identifier)}>
                    <Check size={12} className="mr-1" /> Add
                  </Button>
                </div>
              )}
              {item.status === "not_found" && (
                <Button variant="ghost" size="sm" className="h-7 text-[11px] shrink-0" onClick={() => onSkipOne(item.identifier)}>Skip</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Import BOM Modal (Create New Product) ─────────────────────────────────

function ImportNewProductModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (productId: number) => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<Record<string, unknown>[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [importProductName, setImportProductName] = useState('')
  const [mapping, setMapping] = useState({ identifier: '', quantity: '', description: '', url: '' })
  const [missingItems, setMissingItems] = useState<MissingItemState[]>([])
  const [analyzedMatched, setAnalyzedMatched] = useState<{ identifier: string; stableId: string; qty: number }[]>([])
  const [productImage, setProductImage] = useState<File | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const analyzeMutation = useAnalyzeImport()
  const createImportMutation = useCreateProductImport()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const bstr = evt.target?.result
      const workbook = XLSX.read(bstr, { type: 'binary' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][]

      if (data.length > 0) {
        for (let i = 0; i < Math.min(data.length, 15); i++) {
          const rowStr = data[i].map(v => String(v || '').toLowerCase()).join(' ')
          if (rowStr.includes('product name')) {
            const val = data[i].find(v => v && !String(v).toLowerCase().includes('product name'))
            if (val) setImportProductName(String(val).replace(/^[:\s-]+/, '').trim())
            break
          }
        }

        let headerRowIndex = 0
        for (let i = 0; i < Math.min(data.length, 25); i++) {
          const rowValues = (data[i] || []).map(v => String(v || '').toLowerCase())
          if (rowValues.some(v => v.includes('p/n') || v.includes('pn') || v.includes('description') || v.includes('desc'))) {
            headerRowIndex = i
            break
          }
        }

        const headers = (data[headerRowIndex] || []).map(h => String(h || '').trim()).filter(Boolean)
        const rows = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex }) as Record<string, unknown>[]
        setCsvHeaders(headers)
        setCsvData(rows)
        setMapping({
          identifier: headers.find(h => h.toLowerCase().includes('description') || h.toLowerCase().includes('desc')) || '',
          quantity: headers.find(h => h.toLowerCase().includes('qty') || h.toLowerCase().includes('quantity')) || '',
          description: headers.find(h => h.toLowerCase().includes('description') || h.toLowerCase().includes('desc')) || '',
          url: headers.find(h => h.toLowerCase().includes('remarks') || h.toLowerCase().includes('url') || h.toLowerCase().includes('link')) || '',
        })
      }
    }
    reader.readAsBinaryString(file)
  }

  async function handleAnalyze() {
    if (!importProductName.trim()) { toast.error('Enter a Product Name'); return }
    if (!mapping.identifier || !mapping.quantity) { toast.error('Map Identifier and Quantity columns'); return }

    const items = csvData
      .map(row => ({
        identifier: String(row[mapping.identifier] || '').trim(),
        qty: Number(row[mapping.quantity]) || 0,
        description: mapping.description ? String(row[mapping.description] || '').trim() : undefined,
        url: mapping.url ? String(row[mapping.url] || '').trim() : undefined,
      }))
      .filter(i => i.identifier && i.qty > 0)

    if (items.length === 0) { toast.error('No valid rows found'); return }

    try {
      const result = await analyzeMutation.mutateAsync(items)
      setAnalyzedMatched(result.matched)

      if (result.notFound.length === 0) { setStep(4); return }

      const missing: MissingItemState[] = result.notFound.map(i => ({ ...i, status: 'searching' }))
      setMissingItems(missing)
      setStep(3)

      const detectSupplier = (url: string): "lcsc" | "mouser" | "digikey" | null => {
        const u = url.toLowerCase();
        if (u.includes("lcsc") || u.includes("jlcpcb") || /_C\d+\.html/i.test(u)) return "lcsc";
        if (u.includes("mouser")) return "mouser";
        if (u.includes("digikey")) return "digikey";
        return null;
      };

      // Auto-search suppliers for each missing item
      for (const item of result.notFound) {
        const targetSupplier = detectSupplier(item.url || "");
        
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let found: any = null
          let source = 'mouser'

          // Strip parenthetical alternates e.g. "0ZCJ0010FF2E (FUSC3216X75N)" → "0ZCJ0010FF2E"
          const cleanIdentifier = (item.resolvedMpn || item.identifier).replace(/\s*\(.*?\)/g, '').trim();
          const searchPn = cleanIdentifier;

          // Helper for LCSC Deep Lookup
          const doLcscLookup = async (code: string) => {
            const res = await api.post("/lcsc/lookup", { items: [{ lcsc: code, qty: item.qty }] });
            return res.data?.items?.[0];
          };

          // Helper search per supplier
          const searchLcsc = async () => {
            const res = await api.post("/lcsc/search", { keyword: searchPn, limit: 5 });
            const lcscMatch = res.data?.items?.find((r: { mpn?: string; lcsc?: string }) => r.mpn?.toLowerCase() === searchPn.toLowerCase()) || res.data?.items?.[0];
            if (lcscMatch?.lcsc) {
              const result = await doLcscLookup(lcscMatch.lcsc);
              if (result) { found = result; source = "lcsc"; }
            }
          };
          const searchMouser = async () => {
            const res = await api.post("/mouser/search", { keyword: searchPn, qty: item.qty });
            if (res.data?.items?.[0]) { found = res.data.items[0]; source = "mouser"; }
          };
          const searchDigikey = async () => {
            const res = await api.post("/digikey/search", { keyword: searchPn, qty: item.qty });
            if (res.data?.items?.[0]) { found = res.data.items[0]; source = "digikey"; }
          };

          // 1. Targeted Search
          if (targetSupplier === "lcsc" || item.lcscCode) {
            const code = item.lcscCode || (item.url ? (item.url.match(/_(C\d+)\.html/i)?.[1] || item.url.match(/\/C(\d+)\.html/i)?.[1]) : null);
            if (code) {
              found = await doLcscLookup(`C${code.replace(/^C/i, '')}`);
              if (found) source = "lcsc";
            }
            if (!found) await searchLcsc();
          }
          else if (targetSupplier === "mouser") {
            await searchMouser();
          }
          else if (targetSupplier === "digikey") {
            await searchDigikey();
          }

          // 2. Fallback — prioritize targetSupplier, then remaining suppliers
          if (!found) {
            const allSuppliers: Array<() => Promise<void>> = [
              searchLcsc, searchMouser, searchDigikey,
            ];
            const priorityMap = { lcsc: 0, mouser: 1, digikey: 2 };
            const order = targetSupplier
              ? [priorityMap[targetSupplier], ...([0,1,2].filter(i => i !== priorityMap[targetSupplier]))]
              : [0, 1, 2];
            for (const idx of order) {
              if (found) break;
              await allSuppliers[idx]();
            }
          }

          if (found) {
            setMissingItems(prev => prev.map(m =>
              m.identifier === item.identifier
                ? {
                    ...m,
                    status: 'found',
                    supplierData: {
                      mpn: found.mpn,
                      manufacturer: found.manufacturer,
                      description: found.description,
                      price: found.price,
                      moq: found.moq,
                      priceBreaks: found.priceBreaks,
                      package: found.package,
                      category: found.category,
                      value: found.value,
                      voltageRating: found.voltageRating,
                      tolerance: found.tolerance,
                      source,
                      url: found.url,
                      datasheet: found.datasheet,
                      availability: found.availability,
                      quantity_available: found.quantity_available,
                      specs: found.specs ?? null,
                    }
                  }
                : m
            ))
          } else {
            setMissingItems(prev => prev.map(m => m.identifier === item.identifier ? { ...m, status: 'not_found' } : m))
          }
        } catch {
          setMissingItems(prev => prev.map(m => m.identifier === item.identifier ? { ...m, status: 'not_found' } : m))
        }
      }
    } catch {
      toast.error('Analysis failed')
    }
  }

  async function addItemToDb(item: MissingItemState): Promise<string | null> {
    if (!item.supplierData) return null

    const pn = item.supplierData.mpn || item.identifier

    // Declared outside try so catch block can access for 409 patch
    let enrichedSpecs: { specs?: string | null; value?: string | null; voltageRating?: string | null; tolerance?: string | null; package?: string | null } = {
      specs: item.supplierData.specs,
      value: item.supplierData.value,
      voltageRating: item.supplierData.voltageRating,
      tolerance: item.supplierData.tolerance,
      package: item.supplierData.package,
    }
    if (!item.supplierData.specs && item.supplierData.source !== 'digikey' && pn) {
      try {
        const dkRes = await api.post('/digikey/specs', { mpn: pn })
        if (dkRes.data?.specs) {
          enrichedSpecs = {
            specs: dkRes.data.specs,
            value: dkRes.data.value || item.supplierData.value,
            voltageRating: dkRes.data.voltageRating || item.supplierData.voltageRating,
            tolerance: dkRes.data.tolerance || item.supplierData.tolerance,
            package: dkRes.data.package || item.supplierData.package,
          }
        }
      } catch { /* non-fatal */ }
    }

    try {
      const stableId = genStableId(pn)

      const spMap: SupplierPricesMap = {};
      if (item.supplierData.source) {
        const src = item.supplierData.source as keyof SupplierPricesMap;
        spMap[src] = {
          pn: (src === 'lcsc' ? ((item as MissingItemState & { lcscCode?: string }).lcscCode || pn) : pn),
          price: item.supplierData.price || null,
          moq: item.supplierData.moq || null,
          priceBreaks: item.supplierData.priceBreaks || null,
          url: item.supplierData.url || null,
          availability: item.supplierData.availability || null,
          quantity_available: item.supplierData.quantity_available ?? null,
        };
      }

      await api.post('/items', {
        stableId,
        partNumber: pn,
        productName: item.supplierData.description || pn,
        manufacturer: item.supplierData.manufacturer,
        value: enrichedSpecs.value,
        voltageRating: enrichedSpecs.voltageRating,
        tolerance: enrichedSpecs.tolerance,
        package: enrichedSpecs.package,
        specs: enrichedSpecs.specs,
        category: item.supplierData.category,
        priceMin: item.supplierData.price,
        priceCurrency: 'USD',
        suppliers: item.supplierData.source === 'lcsc' ? 'LCSC' : (item.supplierData.source === 'mouser' ? 'Mouser' : (item.supplierData.source === 'digikey' ? 'DigiKey' : item.supplierData.source)),
        links: item.supplierData.datasheet || item.supplierData.url || null,
        supplierPrices: Object.keys(spMap).length ? JSON.stringify(spMap) : undefined,
      })
      return stableId
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { stableId?: string; existing?: { stableId?: string } } } }
      if (err.response?.status === 409) {
        const existingId = err.response.data?.stableId || err.response.data?.existing?.stableId
        if (existingId) {
          // Patch enriched specs onto existing item if it has none
          if (enrichedSpecs.specs || enrichedSpecs.voltageRating || enrichedSpecs.value || enrichedSpecs.package) {
            try {
              await api.patch(`/items/${existingId}`, {
                ...(enrichedSpecs.specs ? { specs: enrichedSpecs.specs } : {}),
                ...(enrichedSpecs.voltageRating ? { voltageRating: enrichedSpecs.voltageRating } : {}),
                ...(enrichedSpecs.value ? { value: enrichedSpecs.value } : {}),
                ...(enrichedSpecs.package ? { package: enrichedSpecs.package } : {}),
                ...(enrichedSpecs.tolerance ? { tolerance: enrichedSpecs.tolerance } : {}),
              })
            } catch { /* non-fatal */ }
          }
          return existingId
        }
      }
      return null
    }
  }

  async function handleConfirmOne(identifier: string) {
    const item = missingItems.find(m => m.identifier === identifier)
    if (!item) return
    const stableId = await addItemToDb(item)
    if (stableId) {
      setMissingItems(prev => prev.map(m => m.identifier === identifier ? { ...m, status: 'resolved' } : m))
      // Store correct stableId (not the original internal identifier)
      setAnalyzedMatched(prev => [...prev, { identifier, stableId, qty: item.qty }])
    } else {
      toast.error(`Failed to add ${identifier}`)
    }
  }

  async function handleConfirmAll() {
    const toConfirm = missingItems.filter(m => m.status === 'found')
    for (const item of toConfirm) await handleConfirmOne(item.identifier)
    toast.success(`Added ${toConfirm.length} items to database`)
    setStep(4)
  }

  function handleSkipOne(identifier: string) {
    setMissingItems(prev => prev.map(m => m.identifier === identifier ? { ...m, status: 'skipped' } : m))
  }

  function handleSkipAll() {
    setMissingItems(prev => prev.map(m =>
      ['found', 'pending', 'searching', 'not_found'].includes(m.status) ? { ...m, status: 'skipped' } : m
    ))
    setStep(4)
  }

  async function handleExecuteImport() {
    if (!importProductName.trim()) return

    try {
      // Step 1: Create empty product
      const productRes = await api.post('/products', { name: importProductName.trim() })
      const productId = productRes.data.id

      // Step 2: Bulk-add by stableId (not original identifier)
      // analyzedMatched contains correct stableIds from DB lookup + confirmed items
      if (analyzedMatched.length > 0) {
        await api.post(`/products/${productId}/items/bulk-add`, {
          items: analyzedMatched.map(m => ({
            identifier: m.stableId,
            quantity: m.qty,
          }))
        })
      }

      if (productImage) {
        const form = new FormData()
        form.append('file', productImage)
        await api.post(`/products/${productId}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {})
      }

      toast.success(`PCB created with ${analyzedMatched.length} items!`)
      onSuccess(productId)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to import PCB')
    }
  }

  const allReviewed = missingItems.every(m => ['resolved', 'skipped', 'not_found'].includes(m.status))

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-500/10 via-background to-background p-6 border-b border-border/50">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0 border border-blue-500/20">
              <UploadCloud size={22} />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Import New PCB</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Create a new PCB project by uploading a BOM file</p>
            </div>
          </div>

          {/* Step Indicators */}
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className="flex items-center gap-1">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all",
                  step > s ? "bg-green-500 text-white" : step === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {step > s ? <Check size={12} /> : s}
                </div>
                <span className={cn("text-[11px] font-medium hidden sm:block", step === s ? "text-foreground" : "text-muted-foreground")}>
                  {s === 1 ? "Upload" : s === 2 ? "Map Columns" : s === 3 ? "Review Missing" : "Import"}
                </span>
                {s < 4 && <ChevronRight size={12} className="text-muted-foreground mx-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="p-6 space-y-4">
            {!importFile ? (
              <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-border/60 hover:border-blue-500/50 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 bg-card/50 cursor-pointer transition-all hover:bg-blue-500/5 group">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-all">
                  <FileText size={28} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold">Click to upload or drag &amp; drop</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .csv, .xlsx, .xls</p>
                </div>
                <input ref={fileRef} type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500"><FileSpreadsheet size={20} /></div>
                  <div>
                    <p className="text-sm font-bold truncate max-w-[300px]">{importFile.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{csvData.length} Rows Detected</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setImportFile(null); setCsvData([]) }}>Change</Button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Map Columns + Product Name */}
        {step === 2 && (
          <div className="p-6 space-y-5 max-h-[420px] overflow-auto">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Product Name *</Label>
              <Input value={importProductName} onChange={e => setImportProductName(e.target.value)} placeholder="e.g. ESP32 Main Board V2" className="rounded-xl border-2 h-11 font-bold" />
            </div>

            <div className="flex items-center gap-2 text-primary pt-1">
              <Filter size={16} /><h3 className="text-sm font-bold uppercase tracking-wider">Column Mapping</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'identifier' as const, label: 'Identifier (Description)', required: true },
                { key: 'quantity' as const, label: 'Quantity', required: true },
                { key: 'description' as const, label: 'Description (MPN source)', required: false },
                { key: 'url' as const, label: 'URL / Link (Remarks)', required: false },
              ].map(({ key, label, required }) => (
                <div key={key} className="space-y-2">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</Label>
                  <Select value={mapping[key]} onValueChange={(v) => setMapping(prev => ({ ...prev, [key]: v }))}>
                    <SelectTrigger className="rounded-xl border-2 h-10"><SelectValue placeholder="Select column..." /></SelectTrigger>
                    <SelectContent>
                      {!required && <SelectItem value="none">None</SelectItem>}
                      {csvHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex gap-3">
              <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 leading-relaxed">
                Map <b>Description</b> agar MPN diekstrak otomatis (format: &quot;MPN; deskripsi...&quot;).
                Map <b>URL</b> agar LCSC C-code diekstrak untuk search langsung ke LCSC.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Review Missing Items */}
        {step === 3 && (
          <div className="max-h-[440px] overflow-auto">
            {analyzedMatched.length > 0 && (
              <div className="px-6 pt-4 pb-2">
                <div className="flex items-center gap-2 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                  <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                  <p className="text-xs text-green-700 font-medium">{analyzedMatched.length} items found in database</p>
                </div>
              </div>
            )}
            <MissingItemsStep
              items={missingItems}
              onConfirmAll={handleConfirmAll}
              onSkipAll={handleSkipAll}
              onConfirmOne={handleConfirmOne}
              onSkipOne={handleSkipOne}
            />
          </div>
        )}

        {/* Step 4: Summary */}
        {step === 4 && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl text-center">
                <p className="text-2xl font-bold text-green-600">{analyzedMatched.length}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1">Will Import</p>
              </div>
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-center">
                <p className="text-2xl font-bold text-primary">{missingItems.filter(m => m.status === 'resolved').length}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1">New Items Added</p>
              </div>
              <div className="p-4 bg-muted/30 border border-border rounded-xl text-center">
                <p className="text-2xl font-bold text-muted-foreground">{missingItems.filter(m => ['skipped', 'not_found'].includes(m.status)).length}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1">Skipped</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">PCB Name *</Label>
              <Input
                value={importProductName}
                onChange={e => setImportProductName(e.target.value)}
                placeholder="e.g. ESP32 Main Board V2"
                className="rounded-xl border-2 h-11 font-bold"
              />
            </div>
            {/* PCB Image optional */}
            <div
              onClick={() => imageRef.current?.click()}
              className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-border/60 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all"
            >
              <div className="w-10 h-10 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center shrink-0 relative">
                {productImage ? (
                  <Image src={URL.createObjectURL(productImage)} alt="" fill className="object-cover" />
                ) : (
                  <ImagePlus size={16} className="text-muted-foreground/50" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium">{productImage ? productImage.name : 'Add PCB image (optional)'}</p>
                <p className="text-[10px] text-muted-foreground">JPG, PNG, WebP</p>
              </div>
              {productImage && (
                <button onClick={e => { e.stopPropagation(); setProductImage(null) }} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X size={14} />
                </button>
              )}
              <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => setProductImage(e.target.files?.[0] ?? null)} />
            </div>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="p-5 pt-3 bg-muted/30 gap-3 border-t border-border/50">
          <Button variant="ghost" className="h-11 rounded-xl font-bold text-muted-foreground" onClick={onClose}>Cancel</Button>

          {step === 1 && (
            <Button className="h-11 px-8 rounded-xl font-bold" disabled={!importFile} onClick={() => setStep(2)}>
              Next: Map Columns <ChevronRight size={16} className="ml-1" />
            </Button>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => setStep(1)}>Back</Button>
              <Button className="h-11 px-8 rounded-xl font-bold" disabled={!mapping.identifier || !mapping.quantity || analyzeMutation.isPending} onClick={handleAnalyze}>
                {analyzeMutation.isPending ? <><Loader2 size={16} className="mr-2 animate-spin" /> Analyzing...</> : <>Analyze BOM <ChevronRight size={16} className="ml-1" /></>}
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => setStep(2)}>Back</Button>
              <Button className="h-11 px-8 rounded-xl font-bold" onClick={() => setStep(4)} disabled={!allReviewed}>
                Continue <ChevronRight size={16} className="ml-1" />
              </Button>
            </>
          )}
          {step === 4 && (
            <>
              <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => setStep(missingItems.length > 0 ? 3 : 2)}>Back</Button>
              <Button
                className="h-11 px-8 rounded-xl font-bold shadow-lg shadow-blue-500/20 text-white bg-blue-600 hover:bg-blue-700"
                disabled={createImportMutation.isPending || !importProductName.trim()}
                onClick={handleExecuteImport}
              >
                {createImportMutation.isPending ? <><RefreshCw size={16} className="mr-2 animate-spin" /> Creating...</> : <><Check size={16} className="mr-2" /> Create &amp; Import</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const { data: productsData, isLoading } = useAllProducts()
  const products = productsData?.data ?? []

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(debouncedSearch.toLowerCase())
  )

  // Fetch costs only for filtered products
  const productIds = filteredProducts.map(p => p.id)
  const { data: costs, isLoading: costsLoading, isFetching: isFetchingCosts } = useProductCosts('USD', productIds.length > 0 ? productIds : undefined)

  const deleteProduct = useDeleteProduct()
  const renameProduct = useRenameProduct()
  const [isCreating, setIsCreating] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [newProductImage, setNewProductImage] = useState<File | null>(null)
  const createImageRef = useRef<HTMLInputElement>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number, name: string } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: number, name: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  async function handleRename() {
    if (!renameTarget || !editName.trim()) return
    try {
      await renameProduct.mutateAsync({ id: renameTarget.id, name: editName.trim() })
      toast.success('Product renamed')
      setRenameTarget(null)
    } catch {
      toast.error('Failed to rename')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteProduct.mutateAsync(deleteTarget.id)
      toast.success(`PCB "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch {
      toast.error('Failed to delete PCB')
    }
  }

  async function handleCreate() {
    if (!newProductName.trim()) return
    try {
      const res = await api.post('/products', { name: newProductName.trim() })
      const productId = res.data.id
      if (newProductImage) {
        const form = new FormData()
        form.append('file', newProductImage)
        await api.post(`/products/${productId}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {})
      }
      queryClient.invalidateQueries({ queryKey: ['products-all'] })
      toast.success('PCB created')
      router.push(`/products/${productId}`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Failed to create PCB')
    }
  }

  return (
    <div className="flex flex-col h-full gap-6 p-1">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-sm">
            <LayoutGrid size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">PCB</h1>
            <p className="text-sm text-muted-foreground">Manage your Bill of Materials and PCB assemblies</p>
          </div>
        </div>

        {admin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setIsImporting(true)}>
              <FileSpreadsheet size={16} /> Import BOM
            </Button>
            <Button onClick={() => setIsCreating(true)} className="gap-2">
              <Plus size={16} /> New PCB
            </Button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search PCBs by name..."
            className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
          />
        </div>
        <div className="text-sm text-muted-foreground font-medium">
          {filteredProducts.length} PCBs
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-border shadow-sm bg-card min-h-0 flex flex-col">
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted/80 backdrop-blur-sm">
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">PCB Name</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center whitespace-nowrap">Items</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right whitespace-nowrap">Est. Cost</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Last Updated</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-3 py-4"><Skeleton className="h-5 w-48 mb-1.5" /><Skeleton className="h-3 w-24" /></td>
                    <td className="px-3 py-4 text-center"><Skeleton className="h-5 w-10 mx-auto rounded-md" /></td>
                    <td className="px-3 py-4"><Skeleton className="h-5 w-20 ml-auto rounded-md" /></td>
                    <td className="px-3 py-4"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-3 py-4 text-right"><div className="flex justify-end gap-2"><Skeleton className="h-8 w-20 rounded-md" /><Skeleton className="h-8 w-8 rounded-md" /></div></td>
                  </tr>
                ))
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Package size={40} className="opacity-10" />
                      <p className="text-sm">No products found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const costInfo = costs?.find(c => c.productId === product.id)
                  return (
                    <tr key={product.id} className="group hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <button onClick={() => router.push(`/products/${product.id}`)} className="flex items-center gap-3 text-left">
                          <div className="w-8 h-8 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center shrink-0 relative">
                            {product.imageUrl ? (
                              <Image src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/${product.imageUrl}`} alt="" fill className="object-cover" />
                            ) : (
                              <Package size={14} className="text-muted-foreground/40" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground hover:text-primary transition-colors text-[13px]">{product.name}</p>
                            {product.slug && <p className="text-[10px] text-muted-foreground font-mono">{product.slug}</p>}
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant="secondary" className="font-mono tabular-nums text-[10px] px-1.5 h-5 rounded-md">{product._count.items}</Badge>
                      </td>
                      {/* Cost Column */}
                      <td className="px-3 py-2.5 text-right">
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
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {new Date(product.updatedAt || '').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-[11px] gap-1.5 font-medium" onClick={() => router.push(`/products/${product.id}`)}>
                            <Eye size={14} /> Inspect
                          </Button>
                          {admin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreHorizontal size={14} /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => router.push(`/products/${product.id}`)}>
                                  <Pencil size={14} className="mr-2" /> Edit BOM
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setRenameTarget({ id: product.id, name: product.name }); setEditName(product.name) }}>
                                  <RefreshCw size={14} className="mr-2" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: product.id, name: product.name })}>
                                  <Trash2 size={14} className="mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import BOM Modal */}
      {isImporting && (
        <ImportNewProductModal
          onClose={() => setIsImporting(false)}
          onSuccess={(productId) => { setIsImporting(false); router.push(`/products/${productId}`) }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete product "${deleteTarget?.name}"?`}
        description="This will permanently remove the product and all its BOM entries. This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteProduct.isPending}
      />

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setRenameTarget(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200">
            <h2 className="text-lg font-bold mb-1">Rename Product</h2>
            <p className="text-xs text-muted-foreground mb-4">Update the name of your product assembly.</p>
            <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
              className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 mb-6"
              onKeyDown={e => e.key === 'Enter' && handleRename()} />
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setRenameTarget(null)}>Cancel</Button>
              <Button onClick={handleRename} disabled={!editName.trim() || renameProduct.isPending}>
                {renameProduct.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsCreating(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200">
            <h2 className="text-lg font-bold mb-1">Create New PCB</h2>
            <p className="text-xs text-muted-foreground mb-4">Give your PCB a clear, descriptive name.</p>
            <input autoFocus value={newProductName} onChange={e => setNewProductName(e.target.value)} placeholder="e.g. ESP32 Main Board V2"
              className="w-full px-4 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 mb-4"
              onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            {/* PCB Image (optional) */}
            <div
              onClick={() => createImageRef.current?.click()}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border border-dashed border-border/60 cursor-pointer transition-all mb-6",
                "hover:border-primary/40 hover:bg-primary/5"
              )}
            >
              <div className="w-10 h-10 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center shrink-0 relative">
                {newProductImage ? (
                  <Image src={URL.createObjectURL(newProductImage)} alt="" fill className="object-cover" />
                ) : (
                  <ImagePlus size={16} className="text-muted-foreground/50" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">{newProductImage ? newProductImage.name : 'Add PCB image (optional)'}</p>
                <p className="text-[10px] text-muted-foreground">JPG, PNG, WebP</p>
              </div>
              {newProductImage && (
                <button onClick={e => { e.stopPropagation(); setNewProductImage(null) }} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X size={14} />
                </button>
              )}
              <input ref={createImageRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => setNewProductImage(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => { setIsCreating(false); setNewProductImage(null) }}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newProductName.trim()}>Create &amp; Continue</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

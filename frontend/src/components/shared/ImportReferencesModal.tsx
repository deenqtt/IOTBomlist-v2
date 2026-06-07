'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import api from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
import {
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Check,
  Info,
  Filter,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'

interface ParsedRefRow {
  identifier: string        // MPN or PN GSPE
  lcscCode?: string         // LCSC C-code if available
  designators: string       // "R1, R2, C1"
  qty?: number
}

interface PreviewRow extends ParsedRefRow {
  status: 'pending' | 'matched' | 'not_found'
}

interface Props {
  productId: number
  productName: string
  onClose: () => void
}

// Auto-detect header row and columns from a sheet
function parseRefSheet(data: unknown[][]): { headers: string[]; headerRowIndex: number; rows: Record<string, unknown>[] } | null {
  let headerRowIndex = -1
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const row = (data[i] || []).map(v => String(v || '').toLowerCase())
    if (row.some(v => v.includes('part') || v.includes('refr') || v.includes('ref') || v.includes('manufacture') || v.includes('lcsc'))) {
      headerRowIndex = i
      break
    }
  }
  if (headerRowIndex === -1) return null
  const headers = (data[headerRowIndex] || []).map(h => String(h || '').trim()).filter(Boolean)
  const workbookRows = data.slice(headerRowIndex + 1).map(row => {
    const obj: Record<string, unknown> = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
    return obj
  })
  return { headers, headerRowIndex, rows: workbookRows }
}

export function ImportReferencesModal({ productId, productName, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [file, setFile] = useState<File | null>(null)
  const [sheets, setSheets] = useState<{ name: string; headers: string[]; rows: Record<string, unknown>[] }[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [mapping, setMapping] = useState({ identifier: '', lcsc: '', designators: '' })
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const bstr = evt.target?.result
      const wb = XLSX.read(bstr, { type: 'binary' })
      const parsed = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
        const result = parseRefSheet(raw)
        return result ? { name, headers: result.headers, rows: result.rows } : null
      }).filter(Boolean) as { name: string; headers: string[]; rows: Record<string, unknown>[] }[]

      setSheets(parsed)
      if (parsed.length > 0) {
        const first = parsed[0]
        setSelectedSheet(first.name)
        autoMap(first.headers)
      }
    }
    reader.readAsBinaryString(f)
  }

  function autoMap(headers: string[]) {
    const h = headers.map(x => x.toLowerCase())
    const find = (terms: string[]) => headers.find((_, i) => terms.some(t => h[i].includes(t))) || ''
    setMapping({
      identifier: find(['manufacture part', 'mpn', 'mfr part', 'part number', 'pn gspe', 'p/n gspe']),
      lcsc: find(['lcsc']),
      designators: find(['part pcb', 'refrence', 'reference', 'ref', 'designator']),
    })
  }

  function handleSheetChange(name: string) {
    setSelectedSheet(name)
    const sheet = sheets.find(s => s.name === name)
    if (sheet) autoMap(sheet.headers)
    setPreview([])
  }

  async function handlePreview() {
    const sheet = sheets.find(s => s.name === selectedSheet)
    if (!sheet || !mapping.identifier || !mapping.designators) {
      toast.error('Map Identifier and Designators columns')
      return
    }

    setIsPreviewing(true)
    const rows: ParsedRefRow[] = sheet.rows
      .map(row => ({
        identifier: String(row[mapping.identifier] || '').trim(),
        lcscCode: mapping.lcsc ? String(row[mapping.lcsc] || '').trim() || undefined : undefined,
        designators: String(row[mapping.designators] || '').trim(),
        qty: Number(row['QTY'] || row['TOTAL QTY'] || row['QTY PER PCB'] || 0) || undefined,
      }))
      .filter(r => r.identifier && r.designators)

    // Check which ones match DB (via analyze endpoint)
    try {
      const res = await api.post('/products/import/analyze', {
        items: rows.map(r => ({ identifier: r.identifier, qty: r.qty || 1, url: r.lcscCode ? `_${r.lcscCode}.html` : undefined }))
      })
      const matchedIds = new Set(res.data.matched.map((m: { identifier: string }) => m.identifier))
      const notFoundIds = new Set(res.data.notFound.map((m: { identifier: string }) => m.identifier))

      setPreview(rows.map(r => ({
        ...r,
        status: matchedIds.has(r.identifier) ? 'matched' : notFoundIds.has(r.identifier) ? 'not_found' : 'pending'
      })))
      setStep(3)
    } catch {
      toast.error('Preview failed')
    } finally {
      setIsPreviewing(false)
    }
  }

  async function handleImport() {
    const toImport = preview.filter(r => r.status === 'matched')
    if (toImport.length === 0) {
      toast.error('No matched items to import')
      return
    }
    setIsImporting(true)
    try {
      const res = await api.post(`/products/${productId}/import-references`, {
        items: toImport.map(r => ({
          identifier: r.identifier,
          lcscCode: r.lcscCode,
          designators: r.designators,
        }))
      })
      toast.success(`Updated references for ${res.data.updated} items`)
      if (res.data.notFound?.length > 0) toast.warning(`${res.data.notFound.length} items not matched in BOM`)
      qc.invalidateQueries({ queryKey: ['product-items', productId] })
      onClose()
    } catch {
      toast.error('Import failed')
    } finally {
      setIsImporting(false)
    }
  }

  const currentHeaders = sheets.find(s => s.name === selectedSheet)?.headers ?? []
  const matched = preview.filter(r => r.status === 'matched').length
  const notFound = preview.filter(r => r.status === 'not_found').length

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-violet-500/10 via-background to-background p-6 border-b border-border/50">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-500 shrink-0 border border-violet-500/20">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Import References</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adding to: <span className="font-bold text-foreground">{productName}</span>
              </p>
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-1">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-1">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all",
                  step > s ? "bg-green-500 text-white" : step === s ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground"
                )}>
                  {step > s ? <Check size={12} /> : s}
                </div>
                <span className={cn("text-[11px] font-medium hidden sm:block", step === s ? "text-foreground" : "text-muted-foreground")}>
                  {s === 1 ? "Upload" : s === 2 ? "Map Columns" : "Preview & Import"}
                </span>
                {s < 3 && <ChevronRight size={12} className="text-muted-foreground mx-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="p-6 space-y-4">
            {!file ? (
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border/60 hover:border-violet-500/50 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 bg-card/50 cursor-pointer transition-all hover:bg-violet-500/5 group"
              >
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-violet-500/10 group-hover:text-violet-500 transition-all">
                  <FileText size={28} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold">Upload Reference BOM file</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv — multi-sheet supported</p>
                </div>
                <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500">
                    <FileSpreadsheet size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold truncate max-w-[300px]">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                      {sheets.length} Sheet{sheets.length !== 1 ? 's' : ''} Detected
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setFile(null); setSheets([]) }}>Change</Button>
              </div>
            )}

            {sheets.length > 0 && (
              <div className="p-3 bg-violet-500/5 border border-violet-500/20 rounded-xl flex gap-3">
                <Info size={16} className="text-violet-600 shrink-0 mt-0.5" />
                <p className="text-xs text-violet-700 leading-relaxed">
                  Sheet ditemukan: <b>{sheets.map(s => s.name).join(', ')}</b>. Pilih sheet di Step 2.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Map Columns */}
        {step === 2 && (
          <div className="p-6 space-y-5 max-h-[420px] overflow-auto">
            {sheets.length > 1 && (
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sheet</Label>
                <Select value={selectedSheet} onValueChange={handleSheetChange}>
                  <SelectTrigger className="rounded-xl border-2 h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sheets.map(s => <SelectItem key={s.name} value={s.name}>{s.name} ({s.rows.length} rows)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2 text-violet-500 pt-1">
              <Filter size={16} /><h3 className="text-sm font-bold uppercase tracking-wider">Column Mapping</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'identifier' as const, label: 'Identifier (MPN / PN GSPE)', required: true },
                { key: 'designators' as const, label: 'Designators (PART PCB / REFRENCE)', required: true },
                { key: 'lcsc' as const, label: 'LCSC Part Number (Optional)', required: false },
              ].map(({ key, label, required }) => (
                <div key={key} className="space-y-2">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}{required && ' *'}</Label>
                  <Select value={mapping[key]} onValueChange={v => setMapping(prev => ({ ...prev, [key]: v }))}>
                    <SelectTrigger className="rounded-xl border-2 h-10"><SelectValue placeholder="Select column..." /></SelectTrigger>
                    <SelectContent>
                      {!required && <SelectItem value="none">None</SelectItem>}
                      {currentHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex gap-3">
              <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 leading-relaxed">
                Sistem akan match <b>Identifier</b> ke item di BOM product ini, lalu update kolom References dengan designator dari file.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Preview & Import */}
        {step === 3 && (
          <div className="p-6 space-y-4 max-h-[420px] overflow-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-xl text-center">
                <p className="text-xl font-bold text-green-600">{matched}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Matched — will update</p>
              </div>
              <div className="p-3 bg-muted/30 border border-border rounded-xl text-center">
                <p className="text-xl font-bold text-muted-foreground">{notFound}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Not in BOM — skip</p>
              </div>
            </div>

            <div className="space-y-1.5 max-h-[240px] overflow-auto">
              {preview.map(r => (
                <div key={r.identifier} className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-xs transition-all",
                  r.status === 'matched' && "border-green-500/20 bg-green-500/5",
                  r.status === 'not_found' && "border-border/30 bg-muted/20 opacity-50",
                )}>
                  <div className="flex items-center gap-2 min-w-0">
                    {r.status === 'matched'
                      ? <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                      : <XCircle size={14} className="text-muted-foreground shrink-0" />}
                    <span className="font-mono font-bold truncate">{r.identifier}</span>
                    {r.lcscCode && <Badge variant="secondary" className="text-[9px] h-4 px-1 font-mono">{r.lcscCode}</Badge>}
                  </div>
                  <span className="text-muted-foreground font-mono truncate max-w-[200px] shrink-0 text-right">{r.designators}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="p-5 pt-3 bg-muted/30 gap-3 border-t border-border/50">
          <Button variant="ghost" className="h-11 rounded-xl font-bold text-muted-foreground" onClick={onClose}>Cancel</Button>

          {step === 1 && (
            <Button className="h-11 px-8 rounded-xl font-bold bg-violet-600 hover:bg-violet-700 text-white" disabled={!file || sheets.length === 0} onClick={() => setStep(2)}>
              Next: Map Columns <ChevronRight size={16} className="ml-1" />
            </Button>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => setStep(1)}>Back</Button>
              <Button
                className="h-11 px-8 rounded-xl font-bold bg-violet-600 hover:bg-violet-700 text-white"
                disabled={!mapping.identifier || !mapping.designators || isPreviewing}
                onClick={handlePreview}
              >
                {isPreviewing ? <><RefreshCw size={16} className="mr-2 animate-spin" /> Checking...</> : <>Preview <ChevronRight size={16} className="ml-1" /></>}
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => setStep(2)}>Back</Button>
              <Button
                className="h-11 px-8 rounded-xl font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20"
                disabled={isImporting || matched === 0}
                onClick={handleImport}
              >
                {isImporting ? <><RefreshCw size={16} className="mr-2 animate-spin" /> Importing...</> : <><Check size={16} className="mr-2" /> Import {matched} References</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

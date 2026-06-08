"use client";

import { useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  useProduct,
  useProductItems,
  useUpdateProductItem,
  useAddProductItem,
  useRemoveProductItem,
  useRemoveProductItemsBulk,
  useImportBomBulk,
  useProductUsageInSets,
  useAnalyzeImport,
  useProductDocuments,
  useUploadDocument,
  useDeleteDocument,
  downloadProductFile,
  useUploadProductImage,
  useDeleteProductImage,
} from "@/hooks/useProducts";
import { useItems } from "@/hooks/useItems";
import { useAuth } from "@/hooks/useAuth";
import { isAdmin } from "@/lib/auth";
import api from "@/lib/api";
import {
  ArrowLeft,
  Trash2,
  Pencil,
  Search,
  X,
  Check,
  Package,
  Users,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  GitMerge,
  Minus,
  Plus,
  Info,
  Layers,
  Layout,
  FileSpreadsheet,
  UploadCloud,
  FileText,
  Filter,
  Download,
  ChevronDown,
  File,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ImportReferencesModal } from "@/components/shared/ImportReferencesModal";
import { AlternativesPanel } from "@/components/items/AlternativesPanel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useProductCosts } from "@/hooks/useCosting";
import { SupplierPricesMap } from "@/types";
import { DollarSign, AlertCircle } from "lucide-react";

import Image from "next/image";

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
  mpn?: string;
  manufacturer?: string;
  description?: string;
  price?: number | null;
  moq?: number | null;
  priceBreaks?: { qtyFrom: number; qtyTo: number | null; unitPrice: number }[] | null;
  package?: string | null;
  category?: string | null;
  value?: string | null;
  voltageRating?: string | null;
  tolerance?: string | null;
  source?: string;
  url?: string | null;
  datasheet?: string | null;
  availability?: string | null;
  quantity_available?: number | null;
  specs?: string | null;
}

// ─── Types ────────────────────────────────────────────────────────────────

interface MissingItemState {
  identifier: string;
  qty: number;
  resolvedMpn?: string;
  lcscCode?: string;
  url?: string;
  status: "pending" | "searching" | "found" | "not_found" | "resolved" | "skipped";
  supplierData?: SupplierData;
}

// ─── Constants & Helpers ──────────────────────────────────────────────────

function genStableId(mpn: string): string {
  const slug = mpn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8)
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${slug}-${rand}`
}

const SUPPLIER_BADGE: Record<string, string> = {
  lcsc:    'border-blue-200   bg-blue-50   text-blue-700   dark:border-blue-800   dark:bg-blue-950/40   dark:text-blue-300',
  mouser:  'border-green-200  bg-green-50  text-green-700  dark:border-green-800  dark:bg-green-950/40  dark:text-green-300',
  digikey: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
  other:   'border-border bg-muted/60 text-muted-foreground',
}
const SUPPLIER_SHORT: Record<string, string> = {
  lcsc: 'LCSC', mouser: 'Mouser', digikey: 'DK', other: 'Other',
}

interface SupplierEntry {
  pn: string;
  price?: number;
  url?: string;
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
                'text-[9px] px-1.5 py-0.5 rounded-md border font-semibold tracking-wide transition-colors flex items-center gap-1',
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
      {list.map(s => <Badge key={s} variant="outline" className="text-[9px] px-1.5 py-0">{s}</Badge>)}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────

interface BomItem {
  partNumber?: string | null;
  productName?: string | null;
  value?: string | null;
  package?: string | null;
  stockQty?: number | null;
  suppliers?: string | null;
  supplierPrices?: string | null;
  priceCurrency?: string | null;
  alternatives?: string | null;
  links?: string | null;
}

interface BomRowProps {
  row: {
    stableId: string;
    quantitySum?: number;
    price?: number | null;
    supplier?: string | null;
    supplierStock?: number | null;
    references?: string | null;
    item: BomItem;
  };
  productId: number;
  admin: boolean;
  onRemove: () => void;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onFindAlt: (item: BomItem & { stableId: string }) => void;
  tempAltItem?: BomItem;
  onClearTempAlt?: () => void;
}

function BomRow({ row, productId, admin, onRemove, selected, onSelect, onFindAlt, tempAltItem, onClearTempAlt }: BomRowProps) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(row.quantitySum || 0);
  const [refs, setRefs] = useState(row.references || "");
  const updateMutation = useUpdateProductItem();

  async function handleSave() {
    await updateMutation.mutateAsync({
      productId,
      stableId: row.stableId,
      data: { quantitySum: Number(qty), references: refs },
    });
    setEditing(false);
    toast.success(`Updated ${row.stableId}`);
  }

  // Market Stock (Supplier)
  const marketStock = row.supplierStock;
  const numMarketStock = marketStock != null ? Number(marketStock) : null;
  const isMarketOutOfStock = numMarketStock === 0 || numMarketStock == null || isNaN(numMarketStock);
  
  const hasAlts = (row.item.alternatives ?? '').split(/[;,]/).map(s => s.trim()).filter(Boolean).length > 0;

  return (
    <tr className={cn(
      "group hover:bg-muted/30 transition-colors border-b border-border last:border-0",
      selected && "bg-primary/5 hover:bg-primary/10"
    )}>
      {admin && (
        <td className="px-3 py-2.5 text-center">
          <Checkbox checked={selected} onCheckedChange={(v) => onSelect(!!v)} className="translate-y-[2px]" />
        </td>
      )}
      <td className="px-3 py-2.5 font-mono text-[11px] text-primary font-bold">{row.stableId}</td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("text-xs font-medium", tempAltItem && "line-through opacity-50")}>{row.item.partNumber || "—"}</span>
            {tempAltItem && (
               <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 font-bold border-yellow-500 text-yellow-700 bg-yellow-500/10 cursor-pointer" onClick={onClearTempAlt} title="Clear temporary override">
                 TEMP: {tempAltItem.partNumber} <X size={10} className="ml-0.5" />
               </Badge>
            )}
            {!tempAltItem && isMarketOutOfStock && !hasAlts && (
              <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3.5 font-bold animate-pulse">NEED ALT</Badge>
            )}
            {!tempAltItem && isMarketOutOfStock && hasAlts && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 font-bold border-amber-500 text-amber-600 bg-amber-500/5">HAS ALT</Badge>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{row.item.productName}</div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="text-[11px] font-semibold">{row.item.value || "—"}</div>
        <div className="text-[10px] text-muted-foreground">{row.item.package}</div>
      </td>
      <td className="px-3 py-2.5">
        <SupplierPnBadges suppliers={row.item.suppliers} supplierPrices={row.item.supplierPrices || undefined} activeSupplier={row.supplier} />
      </td>
      <td className="px-3 py-2.5">
        {row.price != null ? (
          <div className="flex flex-col">
            <span className="font-mono text-[11px] font-bold text-primary">${row.price.toFixed(4)}</span>
            <span className="text-[8px] text-muted-foreground uppercase font-bold">{row.item.priceCurrency || "USD"}</span>
          </div>
        ) : (
          <span className="text-muted-foreground/30 text-xs">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        {editing ? (
          <input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))}
            className="w-20 px-2 py-1 text-xs border rounded bg-background text-right" />
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-xs font-bold tabular-nums">{row.quantitySum}</span>
            <span className="text-[8px] text-muted-foreground uppercase font-bold">Needed</span>
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col items-center gap-1 min-w-[50px]">
          {isMarketOutOfStock ? (
            <span className="inline-flex items-center justify-center font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-600 text-white shadow-sm animate-pulse ring-2 ring-red-600 ring-offset-1 ring-offset-background">
              0
            </span>
          ) : (
            <Badge variant="secondary"
              className={cn("font-mono text-[10px] px-1.5 py-0 h-4.5 min-h-0 rounded-md",
                numMarketStock != null && "bg-blue-500/10 text-blue-600 border-blue-500/20 shadow-none")}>
              {numMarketStock != null ? numMarketStock.toLocaleString() : "—"}
            </Badge>
          )}
          <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-tight">Market Stock</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs font-mono">
        {editing ? (
          <input value={refs} onChange={(e) => setRefs(e.target.value)}
            className="w-full px-2 py-1 text-xs border rounded bg-background" placeholder="Refs..." />
        ) : (
          <div className="flex flex-col gap-0.5 min-w-[80px]">
            <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[120px]">{row.references || "—"}</span>
          </div>
        )}
      </td>
      {admin && (
        <td className="px-3 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!editing && row.item.links && (() => {
              const urls = row.item.links.split(/[;]/).map(u => u.trim()).filter(Boolean)
              const datasheet = urls.find(u => u.toLowerCase().includes('pdf') || u.toLowerCase().includes('datasheet')) || urls[1]
              return datasheet ? (
                <a href={datasheet} target="_blank" rel="noreferrer" 
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground transition-colors" 
                  title="Open datasheet">
                  <FileText size={14} />
                </a>
              ) : null
            })()}
            {editing ? (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={handleSave}><Check size={14} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setQty(row.quantitySum || 0); setRefs(row.references || ""); setEditing(false); }}><X size={14} /></Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="icon" className={cn("h-8 w-8 text-violet-500 hover:text-violet-600 hover:bg-violet-50", isMarketOutOfStock && !hasAlts && "animate-bounce")} onClick={() => onFindAlt({ ...row.item, stableId: row.stableId })} title="Find alternatives">
                  <GitMerge size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(true)} title="Edit quantity"><Pencil size={14} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onRemove} title="Remove from BOM"><Trash2 size={14} /></Button>
              </>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

function SearchItemRow({ item, onClick }: { item: { stableId: string; partNumber?: string | null; productName?: string | null; package?: string | null; value?: string | null; category?: string | null; suppliers?: string | null; supplierPrices?: string | null }; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex flex-col p-4 hover:bg-accent/50 rounded-xl transition-all border border-border/40 hover:border-primary/30 group text-left gap-2 mb-2 bg-card/50">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm text-foreground tracking-tight">{item.partNumber || "N/A"}</span>
            <Badge variant="outline" className="font-mono text-[9px] h-4 px-1.5 bg-muted/30 text-muted-foreground border-muted-foreground/20">{item.stableId}</Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">{item.productName || "No description available"}</p>
        </div>
        <div className="shrink-0 text-right flex flex-col items-end gap-1">
          <span className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded uppercase tracking-tighter">{item.category || "General"}</span>
          <span className="text-[10px] text-muted-foreground font-medium">{item.package || "—"}</span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1 pt-2 border-t border-border/40">
        <div className="flex gap-6 items-center">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Value</span>
            <span className="text-[11px] font-semibold">{item.value || "—"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider mb-0.5">Suppliers</span>
            <SupplierPnBadges suppliers={item.suppliers} supplierPrices={item.supplierPrices || undefined} />
          </div>
        </div>
        <div className="text-[10px] font-bold text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
          SELECT COMPONENT <ChevronRight size={14} />
        </div>
      </div>
    </button>
  );
}

// ─── Missing Items Step ───────────────────────────────────────────────────

function MissingItemsStep({
  items,
  onConfirmAll,
  onSkipAll,
  onConfirmOne,
  onSkipOne,
}: {
  items: MissingItemState[];
  onConfirmAll: () => void;
  onSkipAll: () => void;
  onConfirmOne: (identifier: string) => void;
  onSkipOne: (identifier: string) => void;
}) {
  const pending = items.filter(i => i.status === "pending" || i.status === "searching" || i.status === "found");
  const resolved = items.filter(i => i.status === "resolved");
  const skipped = items.filter(i => i.status === "skipped" || i.status === "not_found");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold">Missing Items Review</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{pending.length} items not found in database — searching suppliers...</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={onSkipAll}>Skip All</Button>
          <Button size="sm" className="text-xs h-8 bg-green-600 hover:bg-green-700 text-white" onClick={onConfirmAll}>
            <CheckCircle2 size={14} className="mr-1.5" /> Confirm All Found
          </Button>
        </div>
      </div>

      <div className="space-y-2 max-h-[340px] overflow-auto pr-1">
        {items.map(item => (
          <div key={item.identifier} className={cn(
            "border rounded-xl p-3 transition-all",
            item.status === "resolved" && "border-green-500/30 bg-green-500/5",
            item.status === "skipped" && "border-border/30 bg-muted/20 opacity-50",
            item.status === "not_found" && "border-destructive/30 bg-destructive/5 opacity-60",
            item.status === "found" && "border-primary/30 bg-primary/5",
            (item.status === "pending" || item.status === "searching") && "border-border bg-card",
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
                  {item.status === "skipped" && <p className="text-[11px] text-muted-foreground mt-0.5">Skipped</p>}
                </div>
              </div>

              {(item.status === "found") && (
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

      {(resolved.length > 0 || skipped.length > 0) && (
        <div className="flex gap-3 pt-2 border-t border-border/50 text-xs text-muted-foreground">
          {resolved.length > 0 && <span className="text-green-600 font-bold">{resolved.length} added</span>}
          {skipped.length > 0 && <span>{skipped.length} skipped</span>}
        </div>
      )}
    </div>
  );
}

// ─── Files Tab ────────────────────────────────────────────────────────────

function FilesTab({ productId, admin }: { productId: number; admin: boolean }) {
  const { data: docs, isLoading } = useProductDocuments(productId);
  const uploadDoc = useUploadDocument();
  const deleteDoc = useDeleteDocument();
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadDoc.mutateAsync({ productId, file, type: "pick-and-place" });
      toast.success("File uploaded");
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      toast.error("Upload failed");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteDoc.mutateAsync({ productId, docId: deleteTarget });
      toast.success("File deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Delete failed");
    }
  }

  async function handleDownload(doc: { id: number; pathOrUrl: string }) {
    const filename = doc.pathOrUrl.split("/").pop() || `document_${doc.id}`;
    try {
      const res = await api.get(`/products/${productId}/documents/${doc.id}/download`, { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Download failed");
    }
  }

  if (isLoading) return <div className="p-6"><Skeleton className="h-32 w-full" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold">Pick &amp; Place Files</h3>
            <p className="text-xs text-muted-foreground">Upload coordinate files from your EDA software (Altium, KiCad, etc.)</p>
          </div>
          {admin && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => fileRef.current?.click()} disabled={uploadDoc.isPending}>
              {uploadDoc.isPending ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
              Upload File
              <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} accept=".csv,.xlsx,.xls,.txt,.zip" />
            </Button>
          )}
        </div>

        {!docs || docs.length === 0 ? (
          <div
            className={cn(
              "border-2 border-dashed border-border/60 rounded-2xl p-12 flex flex-col items-center justify-center gap-4 bg-muted/20",
              admin && "hover:border-primary/30 hover:bg-primary/5 cursor-pointer transition-all"
            )}
            onClick={admin ? () => fileRef.current?.click() : undefined}
          >
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <File size={28} />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-muted-foreground">No files uploaded yet</p>
              {admin && <p className="text-xs text-muted-foreground mt-1">Click to upload your Pick &amp; Place file</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map(doc => {
              const filename = doc.pathOrUrl.split("/").pop() || `document_${doc.id}`;
              const date = new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
              return (
                <div key={doc.id} className="flex items-center justify-between p-4 border border-border rounded-xl bg-card hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <FileSpreadsheet size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{filename}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{doc.type}</Badge>
                        <span className="text-[11px] text-muted-foreground">{date}</span>
                        {doc.uploadedBy && <span className="text-[11px] text-muted-foreground">by {doc.uploadedBy}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleDownload(doc)}>
                      <Download size={13} /> Download
                    </Button>
                    {admin && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteTarget(doc.id)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this file?"
        description="The file will be permanently removed from the server."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteDoc.isPending}
      />
    </div>
  );
}

// ─── Import BOM Modal (4-step) ─────────────────────────────────────────────

interface ImportBomModalProps {
  productId: number;
  productName: string;
  onClose: () => void;
}

function ImportBomModal({ productId, productName, onClose }: ImportBomModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<Record<string, unknown>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState({ identifier: "", quantity: "", notes: "", description: "", url: "" });
  const [missingItems, setMissingItems] = useState<MissingItemState[]>([]);
  const [analyzedMatched, setAnalyzedMatched] = useState<{ identifier: string; stableId: string; qty: number }[]>([]);
  const [refFile, setRefFile] = useState<File | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);
  const analyzeMutation = useAnalyzeImport();
  const importBomBulk = useImportBomBulk();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const workbook = XLSX.read(bstr, { type: "binary" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(data.length, 25); i++) {
        const rowValues = (data[i] || []).map(v => String(v || "").toLowerCase());
        if (rowValues.some(v => v.includes("p/n") || v.includes("pn") || v.includes("description") || v.includes("desc"))) {
          headerRowIndex = i;
          break;
        }
      }

      const headers = (data[headerRowIndex] || []).map(h => String(h || "").trim()).filter(Boolean);
      const rows = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex }) as Record<string, unknown>[];
      setCsvHeaders(headers);
      setCsvData(rows);

      setMapping({
        identifier: headers.find(h => h.toLowerCase().includes("description") || h.toLowerCase().includes("desc")) || "",
        quantity: headers.find(h => h.toLowerCase().includes("qty") || h.toLowerCase().includes("quantity")) || "",
        notes: "",
        description: headers.find(h => h.toLowerCase().includes("description") || h.toLowerCase().includes("desc")) || "",
        url: headers.find(h => h.toLowerCase().includes("remarks") || h.toLowerCase().includes("url") || h.toLowerCase().includes("link")) || "",
      });
    };
    reader.readAsBinaryString(file);
  }

  async function handleAnalyze() {
    if (!mapping.identifier || !mapping.quantity) {
      toast.error("Map Identifier and Quantity columns first");
      return;
    }

    const items = csvData
      .map(row => ({
        identifier: String(row[mapping.identifier] || "").trim(),
        qty: Number(row[mapping.quantity]) || 0,
        description: mapping.description ? String(row[mapping.description] || "").trim() : undefined,
        url: mapping.url ? String(row[mapping.url] || "").trim() : undefined,
      }))
      .filter(i => i.identifier && i.qty > 0);

    if (items.length === 0) {
      toast.error("No valid rows found");
      return;
    }

    try {
      const result = await analyzeMutation.mutateAsync(items);
      setAnalyzedMatched(result.matched);

      if (result.notFound.length === 0) {
        setStep(4);
        return;
      }

      const missing: MissingItemState[] = result.notFound.map(i => ({ ...i, status: "searching" }));
      setMissingItems(missing);
      setStep(3);

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
        console.log(`[PCB Search] identifier=${item.identifier} targetSupplier=${targetSupplier || 'none'} lcscCode=${item.lcscCode || 'none'} resolvedMpn=${item.resolvedMpn || 'none'}`)
        
        try {
          let found = null;
          let source = "";

          const searchPn = item.resolvedMpn || item.identifier;

          // Helper for LCSC Deep Lookup
          const doLcscLookup = async (code: string) => {
            console.log(`[PCB Search] → LCSC lookup by C-code: ${code}`)
            const res = await api.post("/lcsc/lookup", { items: [{ lcsc: code, qty: item.qty }] });
            return res.data?.items?.[0];
          };

          // 1. If supplier is detected OR we have a clear LCSC code, prioritize that
          if (targetSupplier === "lcsc" || item.lcscCode) {
            const code = item.lcscCode || (item.url ? (item.url.match(/_(C\d+)\.html/i)?.[1]) : null);
            if (code) {
              found = await doLcscLookup(code);
              if (found) source = "lcsc";
            }
            
            if (!found) {
              console.log(`[PCB Search] → LCSC keyword search: "${searchPn}"`)
              const res = await api.post("/lcsc/search", { keyword: searchPn, limit: 5 });
              const lcscMatch = res.data?.items?.find((r: { mpn?: string; lcsc?: string }) => r.mpn?.toLowerCase() === searchPn.toLowerCase()) || res.data?.items?.[0];
              if (lcscMatch?.lcsc) {
                found = await doLcscLookup(lcscMatch.lcsc);
                if (found) source = "lcsc";
              }
            }
          } 
          else if (targetSupplier === "mouser") {
            console.log(`[PCB Search] → Targeted Mouser search: "${searchPn}"`)
            const res = await api.post("/mouser/search", { keyword: searchPn, qty: item.qty });
            found = res.data?.items?.[0];
            if (found) source = "mouser";
          } 
          else if (targetSupplier === "digikey") {
            console.log(`[PCB Search] → Targeted DigiKey search: "${searchPn}"`)
            const res = await api.post("/digikey/search", { keyword: searchPn, qty: item.qty });
            found = res.data?.items?.[0];
            if (found) source = "digikey";
          }

          // 2. Fallback to sequential search if not found or no target detected
          if (!found) {
            console.log(`[PCB Search] → No result from target or no target detected, falling back to sequential search...`)
            
            // Try LCSC first (best data)
            if (!found) {
              const res = await api.post("/lcsc/search", { keyword: searchPn, limit: 5 });
              const lcscMatch = res.data?.items?.[0];
              if (lcscMatch?.lcsc) {
                found = await doLcscLookup(lcscMatch.lcsc);
                if (found) source = "lcsc";
              }
            }

            // Try Mouser
            if (!found) {
              const res = await api.post("/mouser/search", { keyword: searchPn, qty: item.qty });
              found = res.data?.items?.[0];
              if (found) source = "mouser";
            }

            // Try DigiKey
            if (!found) {
              const res = await api.post("/digikey/search", { keyword: searchPn, qty: item.qty });
              found = res.data?.items?.[0];
              if (found) source = "digikey";
            }
          }

          if (found) {
            console.log(`[PCB Search] ✓ Final result for ${item.identifier}: source=${source} mpn=${found.mpn} value=${found.value} voltageRating=${found.voltageRating} tolerance=${found.tolerance} package=${found.package}`)
            setMissingItems(prev => prev.map(m =>
              m.identifier === item.identifier
                ? { 
                    ...m, 
                    status: "found", 
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
            ));
          } else {
            console.log(`[PCB Search] ✗ No result found for ${item.identifier}`)
            setMissingItems(prev => prev.map(m =>
              m.identifier === item.identifier ? { ...m, status: "not_found" } : m
            ));
          }
        } catch (e: unknown) {
          console.error(`[PCB Search] Error for ${item.identifier}:`, e);
          setMissingItems(prev => prev.map(m =>
            m.identifier === item.identifier ? { ...m, status: "not_found" } : m
          ));
        }
      }
    } catch {
      toast.error("Analysis failed");
    }
  }

  async function addItemToDb(item: MissingItemState): Promise<string | null> {
    if (!item.supplierData) return null;
    console.log('[PCB addItemToDb] supplierData full:', JSON.stringify(item.supplierData, null, 2));

    const pn = item.supplierData.mpn || item.identifier;

    // Declared outside try so catch block can access for 409 patch
    let enrichedSpecs: { specs?: string | null; value?: string | null; voltageRating?: string | null; tolerance?: string | null; package?: string | null } = {
      specs: item.supplierData.specs,
      value: item.supplierData.value,
      voltageRating: item.supplierData.voltageRating,
      tolerance: item.supplierData.tolerance,
      package: item.supplierData.package,
    };
    const specsEmpty = !item.supplierData.specs;
    if (specsEmpty && item.supplierData.source !== 'digikey' && pn) {
      try {
        const dkRes = await api.post('/digikey/specs', { mpn: pn });
        if (dkRes.data?.specs) {
          enrichedSpecs = {
            specs: dkRes.data.specs,
            value: dkRes.data.value || item.supplierData.value,
            voltageRating: dkRes.data.voltageRating || item.supplierData.voltageRating,
            tolerance: dkRes.data.tolerance || item.supplierData.tolerance,
            package: dkRes.data.package || item.supplierData.package,
          };
          console.log('[PCB addItemToDb] Enriched specs from DigiKey for', pn);
        }
      } catch {
        // enrichment failure is non-fatal
      }
    }

    try {
      const stableId = genStableId(pn);

      const spMap: SupplierPricesMap = {};
      if (item.supplierData.source) {
        const src = item.supplierData.source as keyof SupplierPricesMap;
        spMap[src] = {
          pn: (src === 'lcsc' ? (item.lcscCode || pn) : pn),
          price: item.supplierData.price || null,
          moq: item.supplierData.moq || null,
          priceBreaks: item.supplierData.priceBreaks || null,
          url: item.supplierData.url || null,
          availability: item.supplierData.availability || null,
          quantity_available: item.supplierData.quantity_available ?? null,
        };
      }

      await api.post("/items", {
        stableId,
        partNumber: pn,
        productName: item.supplierData.description || pn,
        description: item.supplierData.description || null,
        manufacturer: item.supplierData.manufacturer,
        value: enrichedSpecs.value,
        voltageRating: enrichedSpecs.voltageRating,
        tolerance: enrichedSpecs.tolerance,
        package: enrichedSpecs.package,
        specs: enrichedSpecs.specs,
        category: item.supplierData.category,
        priceMin: item.supplierData.price,
        priceCurrency: "USD",
        suppliers: item.supplierData.source === 'lcsc' ? 'LCSC' : (item.supplierData.source === 'mouser' ? 'Mouser' : (item.supplierData.source === 'digikey' ? 'DigiKey' : item.supplierData.source)),
        stockQty: item.supplierData.quantity_available ?? null,
        links: item.supplierData.datasheet || item.supplierData.url || null,
        supplierPrices: Object.keys(spMap).length ? JSON.stringify(spMap) : undefined,
      });
      return stableId;
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
              });
            } catch { /* non-fatal */ }
          }
          return existingId;
        }
      }
      return null;
    }
  }

  async function handleConfirmOne(identifier: string) {
    const item = missingItems.find(m => m.identifier === identifier);
    if (!item) return;
    const stableId = await addItemToDb(item);
    if (stableId) {
      setMissingItems(prev => prev.map(m => m.identifier === identifier ? { ...m, status: "resolved" } : m));
      // Use actual stableId, not original internal identifier
      setAnalyzedMatched(prev => [...prev, { identifier, stableId, qty: item.qty }]);
    } else {
      toast.error(`Failed to add ${identifier} to database`);
    }
  }

  async function handleConfirmAll() {
    const toConfirm = missingItems.filter(m => m.status === "found");
    for (const item of toConfirm) {
      await handleConfirmOne(item.identifier);
    }
    toast.success(`Added ${toConfirm.length} items to database`);
    setStep(4);
  }

  function handleSkipOne(identifier: string) {
    setMissingItems(prev => prev.map(m => m.identifier === identifier ? { ...m, status: "skipped" } : m));
  }

  function handleSkipAll() {
    setMissingItems(prev => prev.map(m =>
      (m.status === "found" || m.status === "pending" || m.status === "searching" || m.status === "not_found") ? { ...m, status: "skipped" } : m
    ));
    setStep(4);
  }

  async function handleExecuteImport() {
    if (analyzedMatched.length === 0) {
      toast.error("No items to import");
      return;
    }

    // Build references lookup from CSV by original identifier
    const refsByIdentifier: Record<string, { notes?: string }> = {};
    if (mapping.notes) {
      csvData.forEach(row => {
        const id = String(row[mapping.identifier] || "").trim();
        if (id) {
          refsByIdentifier[id] = {
            notes: mapping.notes ? String(row[mapping.notes] || "") : undefined,
          };
        }
      });
    }

    try {
      // Use stableIds from analyzedMatched — not the original internal identifiers
      const items = analyzedMatched.map(m => ({
        identifier: m.stableId,
        quantity: m.qty,
        notes: refsByIdentifier[m.identifier]?.notes || undefined,
      }));

      const res = await importBomBulk.mutateAsync({ productId, items });
      toast.success(`Import complete! Added: ${res.added}, Updated: ${res.updated}`);
      if (res.notFound.length > 0) toast.warning(`${res.notFound.length} parts still not matched`);

      // If reference file was uploaded, auto-import references after BOM
      if (refFile) {
        try {
          const XLSX = (await import('xlsx'))
          const buffer = await refFile.arrayBuffer()
          const wb = XLSX.read(buffer, { type: 'array' })
          const refItems: { identifier: string; lcscCode?: string; designators: string }[] = []

          for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName]
            const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
            let hRow = -1
            for (let i = 0; i < Math.min(raw.length, 10); i++) {
              const r = (raw[i] || []).map((v: unknown) => String(v || '').toLowerCase())
              if (r.some((v: string) => v.includes('manufacture') || v.includes('lcsc') || v.includes('part pcb') || v.includes('refrence'))) {
                hRow = i; break
              }
            }
            if (hRow === -1) continue
            const headers = (raw[hRow] || []).map((h: unknown) => String(h || '').trim())
            const h = headers.map(x => x.toLowerCase())
            const idCol = headers.find((_: string, i: number) => h[i].includes('manufacture part') || h[i].includes('mpn') || h[i].includes('mfr part'))
            const lcscCol = headers.find((_: string, i: number) => h[i].includes('lcsc'))
            const refCol = headers.find((_: string, i: number) => h[i].includes('part pcb') || h[i].includes('refrence') || h[i].includes('reference'))
            if (!idCol || !refCol) continue
            const rows = XLSX.utils.sheet_to_json(ws, { range: hRow }) as Record<string, unknown>[]
            rows.forEach((row: Record<string, unknown>) => {
              const id = String(row[idCol] || '').trim()
              const des = String(row[refCol] || '').trim()
              const lcsc = lcscCol ? String(row[lcscCol] || '').trim() : undefined
              if (id && des) refItems.push({ identifier: id, lcscCode: lcsc || undefined, designators: des })
            })
          }

          if (refItems.length > 0) {
            const refRes = await api.post(`/products/${productId}/import-references`, { items: refItems })
            toast.success(`References imported: ${refRes.data.updated} items updated`)
          }
        } catch {
          toast.warning('BOM imported but reference file processing failed')
        }
      }

      onClose();
    } catch {
      toast.error("Import failed");
    }
  }

  const allReviewed = missingItems.every(m => m.status === "resolved" || m.status === "skipped" || m.status === "not_found");

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
              <DialogTitle className="text-xl font-bold">Import Bill of Materials</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Adding to: <span className="font-bold text-foreground">{productName}</span></p>
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
            {/* BOM File */}
            {!importFile ? (
              <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-border/60 hover:border-blue-500/50 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 bg-card/50 cursor-pointer transition-all hover:bg-blue-500/5 group">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-all">
                  <FileText size={28} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold">Upload BOM file</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .csv, .xlsx, .xls</p>
                </div>
                <input ref={fileRef} type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500"><FileSpreadsheet size={16} /></div>
                  <div>
                    <p className="text-sm font-bold truncate max-w-[280px]">{importFile.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{csvData.length} Rows</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setImportFile(null); setCsvData([]); }}>Change</Button>
              </div>
            )}

            {/* Reference File (Optional) */}
            <div className="border border-border/50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Reference File (Optional)</p>
                {refFile && <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setRefFile(null)}>Remove</Button>}
              </div>
              {!refFile ? (
                <div onClick={() => refFileRef.current?.click()} className="border border-dashed border-border/40 hover:border-violet-500/40 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-violet-500/5 transition-all group">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:text-violet-500 transition-colors shrink-0">
                    <FileSpreadsheet size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-medium">Upload Reference BOM to Part PCB.xlsx</p>
                    <p className="text-[10px] text-muted-foreground">Designators (R1, C1, dll) akan di-import setelah BOM selesai</p>
                  </div>
                  <input ref={refFileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={e => setRefFile(e.target.files?.[0] ?? null)} />
                </div>
              ) : (
                <div className="flex items-center gap-3 px-1">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-500 shrink-0"><FileSpreadsheet size={14} /></div>
                  <p className="text-xs font-bold text-violet-600 truncate">{refFile.name}</p>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5 ml-auto shrink-0">Ready</Badge>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Map Columns */}
        {step === 2 && (
          <div className="p-6 space-y-5 max-h-[400px] overflow-auto">
            <div className="flex items-center gap-2 text-primary">
              <Filter size={16} /><h3 className="text-sm font-bold uppercase tracking-wider">Column Mapping</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "identifier" as const, label: "Identifier (Description)", required: true },
                { key: "quantity" as const, label: "Quantity", required: true },
                { key: "description" as const, label: "Description (MPN source)", required: false },
                { key: "url" as const, label: "URL / Link (Remarks)", required: false },
                { key: "notes" as const, label: "Notes", required: false },
              ].map(({ key, label, required }) => (
                <div key={key} className="space-y-2">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}{required && " *"}</Label>
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
                Jika tidak ditemukan di DB → supplier search otomatis berjalan.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Review Missing Items */}
        {step === 3 && (
          <div className="max-h-[480px] overflow-auto">
            {/* Matched summary */}
            {analyzedMatched.length > 0 && (
              <div className="px-6 pt-4 pb-2">
                <div className="flex items-center gap-2 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                  <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                  <p className="text-xs text-green-700 font-medium">{analyzedMatched.length} items found in database and ready to import</p>
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

        {/* Step 4: Summary & Execute */}
        {step === 4 && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl text-center">
                <p className="text-2xl font-bold text-green-600">{analyzedMatched.length}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1">Will Import</p>
              </div>
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-center">
                <p className="text-2xl font-bold text-primary">{missingItems.filter(m => m.status === "resolved").length}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1">New Items Added</p>
              </div>
              <div className="p-4 bg-muted/30 border border-border rounded-xl text-center">
                <p className="text-2xl font-bold text-muted-foreground">{missingItems.filter(m => m.status === "skipped" || m.status === "not_found").length}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1">Skipped</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">Ready to import into <span className="font-bold text-foreground">{productName}</span></p>
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
              <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => setStep(step === 4 && missingItems.length > 0 ? 3 : 2)}>Back</Button>
              <Button
                className="h-11 px-8 rounded-xl font-bold shadow-lg shadow-blue-500/20 text-white bg-blue-600 hover:bg-blue-700"
                disabled={importBomBulk.isPending}
                onClick={handleExecuteImport}
              >
                {importBomBulk.isPending ? <><RefreshCw size={16} className="mr-2 animate-spin" /> Importing...</> : <><Check size={16} className="mr-2" /> Start Import</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const router = useRouter();
  const { id: rawId } = useParams();
  const id = Number(rawId);
  const { user } = useAuth();
  const admin = isAdmin(user);

  const { data: product, isLoading: productLoading } = useProduct(id);
  const { data: bomItems, isLoading: itemsLoading } = useProductItems(id);
  const removeItem = useRemoveProductItem();
  const removeItemsBulk = useRemoveProductItemsBulk();
  const addItem = useAddProductItem();
  const { data: usageData, isLoading: usageLoading } = useProductUsageInSets([id]);

  // Costing Data
  const { data: costs, isLoading: costsLoading, isFetching: isFetchingCosts } = useProductCosts('USD', [id]);
  const costInfo = costs?.[0];

  const [tab, setTab] = useState<"bom" | "usage" | "files">("bom");
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingRefs, setIsImportingRefs] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [bulkRemoveTarget, setBulkRemoveTarget] = useState<string[] | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [pendingItem, setPendingItem] = useState<{ stableId: string; partNumber?: string | null } | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [addRefs, setAddRefs] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const uploadImage = useUploadProductImage(id);
  const deleteImage = useDeleteProductImage(id);

  const [altItem, setAltItem] = useState<(BomItem & { stableId: string }) | null>(null);
  const [exportWarning, setExportWarning] = useState<{ type: "bom" | "bom-alt" | "reference" } | null>(null);

  const [tempAlts, setTempAlts] = useState<Record<string, BomItem>>({});

  const debouncedSearch = useDebounce(itemSearch, 300);
  const { data: searchResults } = useItems({ q: debouncedSearch || undefined, limit: 10 });

  const stats = {
    totalComponents: bomItems?.length || 0,
    uniqueParts: new Set(bomItems?.map(i => i.item.partNumber).filter(Boolean)).size,
    totalQuantity: bomItems?.reduce((sum, item) => sum + (item.quantitySum || 0), 0) || 0,
  };

  async function handleExport(type: "bom" | "bom-alt" | "reference") {
    // Check for critical out-of-stock items without alternatives (and without temp overrides)
    const criticalItems = bomItems?.filter(i => {
      if (tempAlts[i.stableId]) return false; // Handled by temp override
      const isOut = Number((i as BomRowProps['row']).supplierStock) === 0;
      const hasAlts = (i.item.alternatives ?? '').split(/[;,]/).map(s => s.trim()).filter(Boolean).length > 0;
      return isOut && !hasAlts;
    }) ?? [];

    if (criticalItems.length > 0 && type === "bom") {
      setExportWarning({ type });
      return;
    }

    executeExport(type);
  }

  async function executeExport(type: "bom" | "bom-alt" | "reference") {
    setIsExporting(true);
    try {
      // Send the full item objects for temporary overrides instead of just IDs
      await downloadProductFile(id, type, product?.name || "Product", tempAlts);
    } catch {
      toast.error("Export failed");
    } finally {
      setIsExporting(false);
      setExportWarning(null);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    try {
      await removeItem.mutateAsync({ productId: id, stableId: removeTarget });
      toast.success(`Removed ${removeTarget}`);
      setRemoveTarget(null);
      const next = new Set(selectedItems);
      next.delete(removeTarget);
      setSelectedItems(next);
    } catch { toast.error("Failed to remove item"); }
  }

  async function handleBulkRemove() {
    if (!bulkRemoveTarget?.length) return;
    try {
      await removeItemsBulk.mutateAsync({ productId: id, stableIds: bulkRemoveTarget });
      toast.success(`Removed ${bulkRemoveTarget.length} items`);
      setBulkRemoveTarget(null);
      setSelectedItems(new Set());
    } catch { toast.error("Failed to remove items"); }
  }

  async function handleAddConfirm() {
    if (!pendingItem) return;
    if (!Number.isInteger(addQty) || addQty <= 0) { toast.error("Quantity must be a positive whole number"); return; }
    try {
      await addItem.mutateAsync({ productId: id, stableId: pendingItem.stableId, quantitySum: addQty, references: addRefs || undefined });
      toast.success(`Added ${pendingItem.stableId} (Qty: ${addQty})`);
      setPendingItem(null); setAddQty(1); setAddRefs("");
    } catch { toast.error("Failed to add item"); }
  }

  if (productLoading) {
    return (
      <div className="flex flex-col h-full gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div><Skeleton className="h-8 w-64 mb-2" /><Skeleton className="h-4 w-32" /></div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-32 rounded-md" />
            {admin && <Skeleton className="h-10 w-32 rounded-md" />}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-12 w-full" />
        <div className="flex-1 rounded-xl border border-border bg-card p-6"><Skeleton className="h-full w-full rounded-xl opacity-20" /></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-6 p-1">
      {/* ── Header Area ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push('/products')}
            className="h-8 px-2 -ml-2 text-muted-foreground hover:text-foreground transition-all gap-1 group mb-2"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back to PCBs
          </Button>

          <div className="flex items-center gap-4">
            {/* PCB image thumbnail */}
            <div className="relative shrink-0 group">
            <div
              className={cn(
                "w-14 h-14 rounded-xl border-2 border-border overflow-hidden bg-muted flex items-center justify-center relative",
                admin && "cursor-pointer hover:border-primary/50 transition-colors"
              )}
              onClick={() => admin && imageInputRef.current?.click()}
              title={admin ? (product?.imageUrl ? "Click to change image" : "Click to upload PCB image") : undefined}
            >
              {product?.imageUrl ? (
                <Image
                  src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/${product.imageUrl}`}
                  alt="PCB"
                  fill
                  className="object-cover"
                />
              ) : (
                <Package size={22} className="text-muted-foreground/40" />
              )}
              {admin && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                  <Pencil size={14} className="text-white" />
                </div>
              )}
            </div>
            {admin && product?.imageUrl && (
              <button
                onClick={(e) => { e.stopPropagation(); deleteImage.mutate() }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                title="Remove image"
              >
                <X size={10} />
              </button>
            )}
            {admin && (
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    await uploadImage.mutateAsync(file)
                    toast.success('Image updated')
                  } catch {
                    toast.error('Upload failed')
                  }
                  e.target.value = ''
                }}
              />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight truncate">{product?.name || "PCB Detail"}</h1>
              <Badge variant="outline" className="font-mono text-[10px] bg-muted/30">PCB-{id}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">PCB Assembly &amp; BOM Management</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={isExporting}>
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Export <ChevronDown size={13} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">BOM</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleExport("bom")}>
                <FileSpreadsheet size={14} className="mr-2" /> Normal BOM
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("bom-alt")}>
                <FileSpreadsheet size={14} className="mr-2" /> BOM with Alternatives
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Reference</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleExport("reference")}>
                <ExternalLink size={14} className="mr-2" /> Export Reference
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Import dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <UploadCloud size={16} /> Import <ChevronDown size={13} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setIsImporting(true)}>
                <FileSpreadsheet size={14} className="mr-2" /> Import BOM
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsImportingRefs(true)}>
                <FileText size={14} className="mr-2" /> Import References
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {admin && (
            <Button onClick={() => setIsSearching(true)} className="gap-2 shadow-sm">
              <Plus size={16} /> Add Component
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/60 shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><Layers size={20} /></div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Rows</p>
              <p className="text-2xl font-bold tabular-nums">{stats.totalComponents}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/60 shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500"><Layout size={20} /></div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Unique Parts</p>
              <p className="text-2xl font-bold tabular-nums">{stats.uniqueParts}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/60 shadow-none">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600">
              <Package size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Quantity</p>
              <p className="text-2xl font-bold tabular-nums">{stats.totalQuantity.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(
          "bg-card/50 border-border/60 shadow-none transition-colors",
          costInfo?.missingPrices ? "border-amber-500/20 bg-amber-500/[0.02]" : ""
        )}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
              costInfo?.missingPrices ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"
            )}>
              <DollarSign size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estimated Cost</p>
              {costsLoading || isFetchingCosts ? (
                <Skeleton className="h-7 w-24 mt-1" />
              ) : costInfo ? (
                <div className="flex flex-col">
                  <p className="text-2xl font-black tabular-nums tracking-tight">
                    USD {fmt(costInfo.total, 'USD')}
                  </p>
                  {costInfo.missingPrices > 0 && (
                    <div className="flex items-center gap-1 text-[9px] font-black text-amber-600 uppercase tracking-tighter mt-0.5">
                      <AlertCircle size={8} /> {costInfo.missingPrices} unpriced items
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-2xl font-bold text-muted-foreground/30">—</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["bom", "usage", "files"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-6 py-3 text-sm font-medium border-b-2 transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t === "bom" ? "Bill of Materials" : t === "usage" ? "Usage in Sets" : "Files"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto rounded-xl border border-border shadow-sm bg-card min-h-0 flex flex-col relative">
        {tab === "bom" && (
          <div className="overflow-auto h-full flex flex-col">
            {itemsLoading ? (
              <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <>
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-muted/80 backdrop-blur-sm">
                      {admin && <th className="px-3 py-2.5 w-10 text-center"><Checkbox checked={bomItems?.length !== 0 && selectedItems.size === bomItems?.length} onCheckedChange={(v) => { if (v && bomItems) setSelectedItems(new Set(bomItems.map(i => i.stableId))); else setSelectedItems(new Set()); }} className="translate-y-[2px]" /></th>}
                      {["Stable ID", "Part Number", "Value / Specs", "Suppliers", "Unit Price", "Qty", "Stock", "References"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap text-left">{h}</th>
                      ))}
                      {admin && <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right whitespace-nowrap">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bomItems?.length === 0 ? (
                      <tr><td colSpan={admin ? 10 : 8} className="px-3 py-20 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <Package size={40} className="opacity-10" />
                          <p className="text-sm">BOM is empty</p>
                          {admin && <Button onClick={() => setIsSearching(true)} variant="outline" size="sm">Add first component</Button>}
                        </div>
                      </td></tr>
                    ) : (
                      bomItems?.map(row => (
                        <BomRow key={row.stableId} row={row} productId={id} admin={admin}
                          onRemove={() => setRemoveTarget(row.stableId)}
                          selected={selectedItems.has(row.stableId)}
                          onSelect={(checked) => {
                            const next = new Set(selectedItems);
                            if (checked) next.add(row.stableId); else next.delete(row.stableId);
                            setSelectedItems(next);
                          }}
                          onFindAlt={setAltItem}
                          tempAltItem={tempAlts[row.stableId]}
                          onClearTempAlt={() => {
                            setTempAlts(prev => {
                              const next = { ...prev };
                              delete next[row.stableId];
                              return next;
                            });
                          }}
                        />
                      ))
                    )}
                  </tbody>
                </table>

                {admin && selectedItems.size > 0 && (
                  <div className="sticky bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 mx-auto mt-auto">
                    <div className="flex items-center gap-6 px-6 py-3 bg-foreground text-background rounded-2xl shadow-2xl border border-border/10 backdrop-blur-xl">
                      <div className="flex items-center gap-3 border-r border-background/20 pr-6">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">{selectedItems.size}</div>
                        <span className="text-sm font-bold tracking-tight">Components Selected</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="text-background hover:bg-background/10 font-bold text-xs h-9" onClick={() => setSelectedItems(new Set())}>Clear</Button>
                        <Button variant="destructive" size="sm" className="font-bold text-xs h-9 px-4 rounded-xl shadow-lg shadow-destructive/20" onClick={() => setBulkRemoveTarget(Array.from(selectedItems))}>
                          <Trash2 size={14} className="mr-2" /> Remove Selected
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === "usage" && (
          <div className="p-6">
            {usageLoading ? <Skeleton className="h-32 w-full" />
              : usageData && usageData.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {usageData.map(usage => (
                    <div key={usage.setId} className="p-4 border border-border rounded-xl bg-muted/20 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm">{usage.setName}</h3>
                        <Badge variant="outline">{usage.op}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Quantity in Set:</span>
                        <span className="font-mono font-bold text-foreground">{usage.qty}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="w-full mt-2 text-xs h-7" onClick={() => router.push(`/sets/${usage.setId}`)}>View Set</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                  <Users size={40} className="opacity-10" />
                  <p className="text-sm">This product is not used in any ConfigSet</p>
                </div>
              )}
          </div>
        )}

        {tab === "files" && <FilesTab productId={id} admin={admin} />}
      </div>

      {/* Import BOM Modal */}
      {isImporting && product && (
        <ImportBomModal productId={id} productName={product.name} onClose={() => setIsImporting(false)} />
      )}

      {/* Import References Modal */}
      {isImportingRefs && product && (
        <ImportReferencesModal productId={id} productName={product.name} onClose={() => setIsImportingRefs(false)} />
      )}

      {/* Search Modal (Step 1) */}
      {isSearching && (
        <Dialog open onOpenChange={(v) => { if (!v) setIsSearching(false); }}>
          <DialogContent className="max-w-3xl flex flex-col p-0 overflow-hidden border-none shadow-2xl">
            <div className="bg-gradient-to-br from-primary/5 via-background to-background p-8 border-b border-border/50">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20"><Search size={24} /></div>
                <div>
                  <DialogTitle className="text-2xl font-bold">Search Components</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-1">Select a component from your inventory to add to this BOM.</p>
                </div>
              </div>
              <div className="relative group">
                <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input autoFocus value={itemSearch} onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Search by Part Number, Stable ID, or Value..."
                  className="w-full pl-12 pr-4 py-4 bg-card border-2 border-input rounded-2xl focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm text-lg" />
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 min-h-[400px] max-h-[500px] bg-muted/20">
              {searchResults?.data.map(item => (
                <SearchItemRow key={item.stableId} item={item} onClick={() => { 
                  setPendingItem({ stableId: item.stableId, partNumber: item.partNumber }); 
                  setIsSearching(false); 
                }} />
              ))}
              {debouncedSearch && searchResults?.data.length === 0 && (
                <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-4">
                  <Package size={48} className="opacity-10" />
                  <p className="text-sm font-medium italic text-center max-w-xs">No components found matching &ldquo;{debouncedSearch}&rdquo;.</p>
                </div>
              )}
              {!debouncedSearch && (
                <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-4">
                  <Search size={48} className="opacity-10" />
                  <p className="text-sm font-medium italic">Type to search your component database</p>
                </div>
              )}
            </div>
            <DialogFooter className="px-8 py-5 bg-background border-t border-border/50">
              <Button variant="ghost" className="h-11 px-6 rounded-xl font-bold text-muted-foreground" onClick={() => setIsSearching(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Qty Modal (Step 2) */}
      <Dialog open={!!pendingItem} onOpenChange={(v) => { if (!v) setPendingItem(null); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-gradient-to-br from-primary/10 via-background to-background p-6 border-b border-border/50">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 shrink-0"><Package size={28} /></div>
              <div className="min-w-0">
                <DialogTitle className="text-xl font-bold">Set Quantity</DialogTitle>
                <p className="text-xs text-muted-foreground mt-1 truncate">Adding to <span className="font-semibold text-foreground">{product?.name}</span></p>
              </div>
            </div>
            <div className="mt-6 p-4 rounded-xl bg-card border border-border shadow-sm flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Component</p>
                <p className="text-sm font-bold truncate text-foreground">{pendingItem?.partNumber || "No Part Number"}</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{pendingItem?.stableId}</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Quantity to Add</label>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" className="h-12 w-14 rounded-xl border-2" onClick={() => setAddQty(prev => Math.max(1, prev - 1))}><Minus size={18} /></Button>
                <input type="number" min="1" step="1" autoFocus value={addQty}
                  onChange={(e) => setAddQty(Math.max(1, Math.floor(Number(e.target.value))))}
                  onKeyDown={(e) => e.key === "Enter" && handleAddConfirm()}
                  className="flex-1 h-12 px-4 text-xl font-mono font-bold border-2 border-input rounded-xl bg-background focus:border-primary outline-none transition-all text-center" />
                <Button variant="outline" size="icon" className="h-12 w-14 rounded-xl border-2" onClick={() => setAddQty(prev => prev + 1)}><Plus size={18} /></Button>
              </div>
            </div>
            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider ml-1">References (Optional)</label>
              <div className="relative group">
                <Pencil size={16} className="absolute left-3 top-3 text-muted-foreground" />
                <input value={addRefs} onChange={(e) => setAddRefs(e.target.value)} placeholder="e.g. R1, R2, R10..."
                  className="w-full pl-10 pr-4 py-3 text-sm border-2 border-input rounded-xl bg-background focus:border-primary outline-none transition-all" />
              </div>
            </div>
          </div>
          <DialogFooter className="p-6 pt-2 bg-muted/30 gap-3">
            <Button variant="ghost" className="flex-1 h-11 rounded-xl font-bold" onClick={() => { setPendingItem(null); setIsSearching(true); }}>Back</Button>
            <Button className="flex-[2] h-11 rounded-xl font-bold" onClick={handleAddConfirm} disabled={addItem.isPending}>
              {addItem.isPending ? <><RefreshCw size={16} className="mr-2 animate-spin" /> Adding...</> : <><Check size={16} className="mr-2" /> Add to BOM</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!removeTarget} title={`Remove ${removeTarget} from BOM?`} description="The item will be removed from this product's Bill of Materials." onConfirm={handleRemove} onCancel={() => setRemoveTarget(null)} loading={removeItem.isPending} />
      <ConfirmDialog open={!!bulkRemoveTarget} title={`Remove ${bulkRemoveTarget?.length} items?`} description={`Remove ${bulkRemoveTarget?.length} components from this product? Cannot be undone.`} onConfirm={handleBulkRemove} onCancel={() => setBulkRemoveTarget(null)} loading={removeItemsBulk.isPending} />

      {altItem && (
        <AlternativesPanel 
          item={altItem} 
          onClose={() => setAltItem(null)} 
          onSelectTempAlt={(newItem) => {
            setTempAlts(prev => ({ ...prev, [altItem.stableId]: newItem }));
            setAltItem(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!exportWarning}
        title="Out of Stock Items Detected"
        description="Some items in this BOM have 0 market stock and no alternatives listed. These rows will be highlighted in RED in the exported Excel. Do you want to proceed with the export anyway?"
        onConfirm={() => exportWarning && executeExport(exportWarning.type)}
        onCancel={() => setExportWarning(null)}
        confirmText="Export Anyway"
        cancelText="Fix First"
      />
    </div>
  );
}

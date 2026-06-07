'use client'

import { useEffect, useState } from 'react'
import type { Item, SupplierPricesMap } from '@/types'
import { useItemMetaAll } from '@/hooks/useItems'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'

interface Props {
  open: boolean
  item?: Item | null
  onClose: () => void
  onSave: (data: Partial<Item>) => Promise<void>
}

type SupplierSource = 'lcsc' | 'mouser' | 'digikey' | 'other'
const SUPPLIER_SOURCES: SupplierSource[] = ['lcsc', 'mouser', 'digikey', 'other']
const SUPPLIER_LABELS: Record<SupplierSource, string> = {
  lcsc: 'LCSC / JLCPCB',
  mouser: 'Mouser',
  digikey: 'DigiKey',
  other: 'Other',
}

function parseSupplierPrices(raw?: string | null): SupplierPricesMap {
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

export function ItemFormModal({ open, item, onClose, onSave }: Props) {
  const [form, setForm] = useState<Partial<Item>>({})
  const [spMap, setSpMap] = useState<SupplierPricesMap>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { data: meta } = useItemMetaAll()

  useEffect(() => {
    const base = item ?? { priceCurrency: 'USD' }
    setForm(base)
    setSpMap(parseSupplierPrices(item?.supplierPrices))
    setError('')
  }, [item, open])

  const isEdit = !!item

  function set(key: keyof Item, val: string | number | boolean) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function setSpPn(src: SupplierSource, pn: string) {
    setSpMap(m => ({ ...m, [src]: { ...(m[src] ?? {}), pn: pn || null } }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const hasSpEntries = SUPPLIER_SOURCES.some(s => spMap[s]?.pn)
      const payload: Partial<Item> = {
        ...form,
        supplierPrices: hasSpEntries ? JSON.stringify(spMap) : (form.supplierPrices ?? undefined),
      }
      await onSave(payload)
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      setError(e?.response?.data?.message ?? e?.message ?? 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit Item` : 'Add Item'}</DialogTitle>
          {isEdit && <DialogDescription className="font-mono text-xs">{item.stableId}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-5 px-6 py-5">
          {/* Identifikasi */}
          <Section label="Identification">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stable ID *" disabled={isEdit}>
                <FieldInput value={(form.stableId as string) ?? ''} onChange={e => set('stableId', e.target.value)} disabled={isEdit} required />
              </Field>
              <Field label="Part Number MFR *">
                <FieldInput value={(form.partNumber as string) ?? ''} onChange={e => set('partNumber', e.target.value)} required />
              </Field>
              <Field label="Manufacturer">
                <FieldInput value={(form.manufacturer as string) ?? ''} onChange={e => set('manufacturer', e.target.value)} placeholder="e.g. Texas Instruments" />
              </Field>
              <Field label="Product Name">
                <FieldInput value={(form.productName as string) ?? ''} onChange={e => set('productName', e.target.value)} />
              </Field>
            </div>
          </Section>

          {/* Properti Komponen */}
          <Section label="Component Properties">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select
                  value={(form.category as string) ?? ''}
                  onValueChange={v => set('category', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— Select Category —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {meta?.categories.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Package">
                <FieldInput value={(form.package as string) ?? ''} onChange={e => set('package', e.target.value)} list="pkg-list-form" placeholder="e.g. 0402, SOT-23" />
                <datalist id="pkg-list-form">
                  {meta?.packages.map(p => <option key={p} value={p} />)}
                </datalist>
              </Field>
              <Field label="Value">
                <FieldInput value={(form.value as string) ?? ''} onChange={e => set('value', e.target.value)} placeholder="e.g. 100nF, 10kΩ" />
              </Field>
              <Field label="Voltage Rating">
                <FieldInput value={(form.voltageRating as string) ?? ''} onChange={e => set('voltageRating', e.target.value)} placeholder="e.g. 50V" />
              </Field>
              <Field label="Tolerance">
                <FieldInput value={(form.tolerance as string) ?? ''} onChange={e => set('tolerance', e.target.value)} placeholder="e.g. ±5%" />
              </Field>
              <Field label="Description">
                <FieldInput value={(form.description as string) ?? ''} onChange={e => set('description', e.target.value)} />
              </Field>
            </div>
          </Section>

          {/* Supplier Part Numbers */}
          <Section label="Supplier Part Numbers">
            <div className="grid grid-cols-2 gap-3">
              {SUPPLIER_SOURCES.map(src => (
                <Field key={src} label={SUPPLIER_LABELS[src]}>
                  <FieldInput
                    value={spMap[src]?.pn ?? ''}
                    onChange={e => setSpPn(src, e.target.value)}
                    placeholder={
                      src === 'lcsc' ? 'e.g. C7972' :
                      src === 'mouser' ? 'e.g. 595-LM358P' :
                      src === 'digikey' ? 'e.g. 296-1391-5-ND' :
                      'Alternative PN'
                    }
                  />
                </Field>
              ))}
            </div>
          </Section>

          {/* Harga & Stok */}
          <Section label="Pricing & Stock">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price Min">
                <FieldInput type="number" step="0.0001" value={(form.priceMin as number) ?? ''} onChange={e => set('priceMin', Number(e.target.value))} />
              </Field>
              <Field label="Currency">
                <FieldInput value={(form.priceCurrency as string) ?? 'USD'} onChange={e => set('priceCurrency', e.target.value)} />
              </Field>
              <Field label="Stock Qty">
                <FieldInput type="number" value={(form.stockQty as number) ?? ''} onChange={e => set('stockQty', Number(e.target.value))} />
              </Field>
              <Field label="WH Location">
                <FieldInput value={(form.whLocation as string) ?? ''} onChange={e => set('whLocation', e.target.value)} placeholder="e.g. Rack-A1" />
              </Field>
              <Field label="Datasheet / Link">
                <FieldInput value={(form.links as string) ?? ''} onChange={e => set('links', e.target.value)} placeholder="https://..." />
              </Field>
            </div>
          </Section>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}
        </form>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'px-4 py-2 text-sm border border-border rounded-md',
              '[@media(hover:hover)]:hover:bg-accent',
              'active:scale-[0.97] transition-transform duration-100',
            )}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            className={cn(
              'px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium',
              '[@media(hover:hover)]:hover:opacity-90',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'active:scale-[0.97] transition-transform duration-100',
            )}
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <RefreshCw size={13} className="animate-spin" /> Saving...
              </span>
            ) : 'Save changes'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">{label}</p>
      {children}
    </section>
  )
}

function Field({ label, children, disabled }: { label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div className={cn('space-y-1', disabled && 'opacity-50')}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function FieldInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full px-3 py-2 text-sm border border-input rounded-md bg-background',
        'placeholder:text-muted-foreground/60',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'transition-shadow duration-150',
        className,
      )}
      {...props}
    />
  )
}

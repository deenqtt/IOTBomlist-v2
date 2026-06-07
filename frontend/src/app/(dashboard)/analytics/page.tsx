"use client";

import React, { useState, useMemo } from "react";
import {
  useAnalyticsSummary,
  useAnalyticsByCategory,
  useAnalyticsBySupplier,
  useAnalyticsMissingBySet,
  useAnalyticsProjectHealth,
} from "@/hooks/useAnalytics";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  RefreshCw,
  Cpu,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  Search,
  Activity,
  PieChart,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/MetricCard";

/* ─── sort hook ─────────────────────────────────────────── */

type SortDir = "asc" | "desc";
interface Sort {
  col: string;
  dir: SortDir;
}

function useSort(defaultCol: string, defaultDir: SortDir = "desc") {
  const [sort, setSort] = useState<Sort>({ col: defaultCol, dir: defaultDir });
  function toggle(col: string) {
    setSort((s) =>
      s.col === col
        ? { col, dir: s.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "desc" },
    );
  }
  return { sort, toggle };
}

/* ─── small components ──────────────────────────────────── */

function SortIcon({ col, sort }: { col: string; sort: Sort }) {
  if (sort.col !== col)
    return (
      <ArrowUpDown
        size={10}
        className="opacity-25 group-hover:opacity-60 transition-opacity"
      />
    );
  return sort.dir === "asc" ? (
    <ArrowUp size={10} className="text-primary" />
  ) : (
    <ArrowDown size={10} className="text-primary" />
  );
}

function SortTh({
  label,
  col,
  sort,
  onSort,
  right,
  center,
  className,
}: {
  label: string;
  col: string;
  sort: Sort;
  onSort: (c: string) => void;
  right?: boolean;
  center?: boolean;
  className?: string;
}) {
  const active = sort.col === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={cn(
        "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider border-b border-border",
        "cursor-pointer select-none group transition-colors duration-100",
        "[@media(hover:hover)]:hover:bg-accent/50",
        active ? "text-primary" : "text-muted-foreground",
        right ? "text-right" : center ? "text-center" : "text-left",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1",
          right && "justify-end w-full",
          center && "justify-center w-full",
        )}
      >
        {label}
        <SortIcon col={col} sort={sort} />
      </span>
    </th>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-64 flex flex-col justify-end gap-2 px-4 py-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton
            className="h-3 w-24 rounded-full shrink-0"
            style={{ opacity: 0.5 }}
          />
          <Skeleton
            className="h-4 rounded-sm"
            style={{ width: `${30 + (i % 5) * 14}%`, opacity: 0.4 - i * 0.04 }}
          />
        </div>
      ))}
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  valueLabel = "Count",
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  valueLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover/80 backdrop-blur-md border border-border rounded-xl px-4 py-2.5 shadow-xl text-sm animate-in zoom-in-95 duration-200">
      <p className="font-bold mb-1.5 text-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary" />
        <p className="text-muted-foreground font-medium">
          {valueLabel}:{" "}
          <span className="font-black text-foreground tabular-nums">
            {payload[0].value.toLocaleString()}
          </span>
        </p>
      </div>
    </div>
  );
}

/* ─── page ───────────────────────────────────────────────── */

export default function AnalyticsPage() {
  const qc = useQueryClient();
  const [catLimit, setCatLimit] = useState(20);
  const [supLimit, setSupLimit] = useState(15);
  const [missingQ, setMissingQ] = useState("");
  const { sort, toggle } = useSort("missingPrices");

  const summary = useAnalyticsSummary();
  const byCategory = useAnalyticsByCategory();
  const bySupplier = useAnalyticsBySupplier();
  const missingBySet = useAnalyticsMissingBySet();
  const projectHealth = useAnalyticsProjectHealth();

  const isRefreshing =
    summary.isFetching ||
    byCategory.isFetching ||
    bySupplier.isFetching ||
    missingBySet.isFetching ||
    projectHealth.isFetching;

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ["analytics-summary"] });
    qc.invalidateQueries({ queryKey: ["analytics-by-category"] });
    qc.invalidateQueries({ queryKey: ["analytics-by-supplier"] });
    qc.invalidateQueries({ queryKey: ["analytics-missing-by-set"] });
    qc.invalidateQueries({ queryKey: ["analytics-project-health"] });
  }

  const s = summary.data;
  const enrichPct =
    s && s.totalItems > 0
      ? Math.round((s.enrichedItems / s.totalItems) * 100)
      : 0;

  const catData = (byCategory.data ?? []).slice(0, catLimit);
  const supData = (bySupplier.data ?? []).slice(0, supLimit);

  const filteredMissing = useMemo(() => {
    const list = (missingBySet.data ?? []).filter((r) =>
      !missingQ || r.setName.toLowerCase().includes(missingQ.toLowerCase()),
    );
    return [...list].sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      if (sort.col === "missingPrices")
        return (a.missingPrices - b.missingPrices) * dir;
      if (sort.col === "coverage") {
        const ca = a.bomRows > 0 ? (a.bomRows - a.missingPrices) / a.bomRows : 1;
        const cb = b.bomRows > 0 ? (b.bomRows - b.missingPrices) / b.bomRows : 1;
        return (ca - cb) * dir;
      }
      if (sort.col === "bomRows") return (a.bomRows - b.bomRows) * dir;
      if (sort.col === "products") return (a.products - b.products) * dir;
      return a.setName.localeCompare(b.setName) * dir;
    });
  }, [missingBySet.data, missingQ, sort]);

  const allCovered =
    !missingBySet.isLoading &&
    missingBySet.data &&
    missingBySet.data.every((r) => r.missingPrices === 0);

  return (
    <div className="flex flex-col gap-6 p-1">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-6 pb-2">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 shadow-inner">
            <Zap size={28} className="text-blue-500" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-foreground leading-none">
              Intelligence <span className="text-blue-500 text-sm align-top ml-1">Center</span>
            </h1>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5 flex items-center gap-1.5 opacity-60">
              <Activity size={10} /> Operational & Inventory Insights
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          title="Refresh intelligence"
          className={cn(
            "h-10 w-10 flex items-center justify-center rounded-xl border border-border bg-card shadow-sm transition-all",
            "text-muted-foreground hover:text-foreground hover:border-primary/50 active:scale-90",
          )}
        >
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── Summary Grid ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Component Registry"
          value={s?.totalItems}
          icon={Cpu}
          subValue="unique parts"
        />
        <MetricCard
          label="Price Enrichment"
          value={s ? `${enrichPct}%` : undefined}
          icon={ShieldCheck}
          variant="success"
          subValue={`${s?.enrichedItems.toLocaleString()} items`}
        />
        <MetricCard
          label="Production Pipeline"
          value={s?.totalSupersets}
          icon={GitBranch}
          variant="info"
          subValue="active projects"
        />
        <MetricCard
          label="Inventory Intelligence Gap"
          value={s?.missingPrices}
          icon={AlertCircle}
          variant={(s?.missingPrices ?? 0) > 0 ? "warn" : "default"}
          subValue="items missing prices"
        />
      </div>

      {/* ── Charts Section ─────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* By Category */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-primary/10 transition-colors" />
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div>
              <h2 className="font-black text-lg tracking-tight flex items-center gap-2">
                <PieChart size={18} className="text-primary" />
                Category Density
              </h2>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                Distribution across {byCategory.data?.length ?? 0} categories
              </p>
            </div>
            <Select value={String(catLimit)} onValueChange={(v) => setCatLimit(Number(v))}>
              <SelectTrigger className="h-8 w-24 text-[10px] font-black uppercase rounded-lg px-2 border-border/50 bg-muted/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 50].map((v) => (
                  <SelectItem key={v} value={String(v)}>Top {v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {byCategory.isLoading ? (
            <ChartSkeleton />
          ) : catData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2 opacity-50 italic">
               <div className="w-12 h-12 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                  <X size={20} />
               </div>
               No category data found
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={catData} layout="vertical" margin={{ left: 8, right: 32, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis type="number" hide />
                <YAxis 
                  type="category" 
                  dataKey="category" 
                  width={140} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor', opacity: 0.7 }} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip content={<CustomTooltip valueLabel="Items" />} cursor={{ fill: 'hsl(var(--primary)/0.05)', radius: 4 }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={24} fill="hsl(var(--primary))">
                   {catData.map((_, i) => (
                     <Cell key={i} fillOpacity={1 - (i / catData.length) * 0.4} />
                   ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By Supplier */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-green-500/10 transition-colors" />
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div>
              <h2 className="font-black text-lg tracking-tight flex items-center gap-2 text-foreground text-foreground">
                <GitBranch size={18} className="text-green-500" />
                Supplier Reach
              </h2>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                Market presence via {bySupplier.data?.length ?? 0} sources
              </p>
            </div>
            <Select value={String(supLimit)} onValueChange={(v) => setSupLimit(Number(v))}>
              <SelectTrigger className="h-8 w-24 text-[10px] font-black uppercase rounded-lg px-2 border-border/50 bg-muted/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 15, 20, 30].map((v) => (
                  <SelectItem key={v} value={String(v)}>Top {v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {bySupplier.isLoading ? (
            <ChartSkeleton />
          ) : supData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2 opacity-50 italic">
               <div className="w-12 h-12 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-foreground">
                  <X size={20} />
               </div>
               No supplier data found
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={supData} layout="vertical" margin={{ left: 8, right: 32, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis type="number" hide />
                <YAxis 
                  type="category" 
                  dataKey="supplier" 
                  width={140} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor', opacity: 0.7 }} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip content={<CustomTooltip valueLabel="Items" />} cursor={{ fill: '#22c55e0a', radius: 4 }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={24} fill="#22c55e">
                  {supData.map((_, i) => (
                    <Cell key={i} fillOpacity={1 - (i / supData.length) * 0.4} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Project Health Pulse ─────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm overflow-hidden group">
         <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
               <Activity size={20} strokeWidth={2.5} />
            </div>
            <div>
               <h2 className="font-black text-lg tracking-tight">Project Readiness Pulse</h2>
               <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                 Financial readiness based on BOM price coverage
               </p>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {projectHealth.isLoading ? (
               Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl opacity-50" />)
            ) : projectHealth.data?.slice(0, 4).map(p => (
               <div key={p.id} className="p-4 rounded-2xl border border-border/50 bg-muted/10 space-y-3 hover:border-primary/30 transition-all cursor-default">
                  <div className="flex justify-between items-start">
                     <p className="text-xs font-black truncate max-w-[120px]">{p.name}</p>
                     <Badge className={cn(
                        "px-1.5 py-0 rounded text-[9px] font-black border-none",
                        p.coverage === 100 ? "bg-green-500/20 text-green-600" :
                        p.coverage >= 70 ? "bg-amber-500/20 text-amber-600" : "bg-destructive/20 text-destructive"
                     )}>
                        {p.coverage}%
                     </Badge>
                  </div>
                  <div className="relative h-2 w-full bg-muted rounded-full overflow-hidden">
                     <div 
                        className={cn(
                           "absolute inset-y-0 left-0 transition-all duration-1000 ease-out rounded-full",
                           p.coverage === 100 ? "bg-green-500" : p.coverage >= 70 ? "bg-amber-500" : "bg-destructive"
                        )}
                        style={{ width: `${p.coverage}%` }}
                     />
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-bold text-muted-foreground uppercase">
                     <span>{p.totalRows - p.missingRows} OK</span>
                     <span className={p.missingRows > 0 ? "text-destructive" : ""}>{p.missingRows} MISSING</span>
                  </div>
               </div>
            ))}
         </div>
      </div>

      {/* ── Risk Intelligence: Missing Prices ───────────── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden text-foreground">
        {/* Section header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between gap-4 flex-wrap bg-muted/5">
          <div className="flex items-center gap-3 text-foreground">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
               <AlertCircle size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="font-black text-lg tracking-tight text-foreground">Risk Radar: Price Gaps</h2>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                Impact analysis of missing financial data per product
              </p>
            </div>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
            <input
              value={missingQ}
              onChange={(e) => setMissingQ(e.target.value)}
              placeholder="Search products…"
              className="pl-9 pr-8 py-2 text-xs font-bold border border-border rounded-xl bg-background w-56 focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/30 transition-all shadow-sm"
            />
            {missingQ && (
              <button
                onClick={() => setMissingQ("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* All-clear state */}
        {allCovered && !missingQ && (
          <div className="flex flex-col items-center gap-4 px-6 py-20 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center text-green-600 shadow-inner">
               <CheckCircle2 size={40} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-xl font-black tracking-tight">Full Coverage Achieved</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                All components in all product BOMs have been successfully enriched with pricing data. Ready for cost analysis.
              </p>
            </div>
          </div>
        )}

        {/* Table */}
        {(!allCovered || missingQ) && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted/30 backdrop-blur-sm">
                <tr className="border-b border-border text-foreground">
                  <SortTh label="Product / Bundle" col="name" sort={sort} onSort={toggle} className="px-6" />
                  <SortTh label="PCBs" col="products" sort={sort} onSort={toggle} center />
                  <SortTh label="BOM Lines" col="bomRows" sort={sort} onSort={toggle} center />
                  <SortTh label="Gap Impact" col="missingPrices" sort={sort} onSort={toggle} center />
                  <SortTh label="Readiness" col="coverage" sort={sort} onSort={toggle} right className="pr-6" />
                </tr>
              </thead>
              <tbody>
                {missingBySet.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {[160, 60, 60, 60, 100].map((w, j) => (
                        <td key={j} className="px-6 py-4">
                          <Skeleton
                            className="h-3 rounded-full mx-auto"
                            style={{ width: w, opacity: Math.max(0.12, 1 - i * 0.12) }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredMissing.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-20 text-muted-foreground text-sm italic opacity-50">
                      No matching records found for &quot;{missingQ}&quot;
                    </td>
                  </tr>
                ) : (
                  filteredMissing.map((row, i) => {
                    const pct = row.bomRows > 0 ? Math.round(((row.bomRows - row.missingPrices) / row.bomRows) * 100) : 100;
                    const maxMissing = Math.max(...missingBySet.data!.map(d => d.missingPrices), 1);
                    const relativeImpact = (row.missingPrices / maxMissing) * 100;
                    
                    return (
                      <tr
                        key={row.setId}
                        className={cn(
                          "border-b border-border/60 transition-all duration-200 group/row",
                          "hover:bg-primary/[0.02]",
                          i % 2 !== 0 && "bg-muted/[0.01]",
                        )}
                      >
                        {/* Set name */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                               "w-2 h-8 rounded-full transition-all group-hover/row:scale-y-110",
                               pct === 100 ? "bg-green-500" : pct >= 70 ? "bg-amber-500" : "bg-destructive"
                            )} />
                            <div className="min-w-0">
                               <p className="font-bold text-sm truncate">{row.setName}</p>
                               <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight opacity-60">ID: {row.setId}</p>
                            </div>
                          </div>
                        </td>
                        {/* Products */}
                        <td className="px-4 py-4 text-center text-muted-foreground tabular-nums font-black text-xs">
                          {row.products}
                        </td>
                        {/* BOM Rows */}
                        <td className="px-4 py-4 text-center text-muted-foreground tabular-nums font-black text-xs">
                          {row.bomRows}
                        </td>
                        {/* Gap Impact */}
                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-col items-center gap-1.5 min-w-[120px] mx-auto">
                             <div className="flex justify-between w-full px-1">
                                <Badge className={cn(
                                   "px-1.5 py-0 h-4 rounded text-[9px] font-black border-none",
                                   row.missingPrices > 0 ? "bg-destructive text-destructive-foreground shadow-sm" : "bg-green-500/10 text-green-600"
                                )}>
                                   {row.missingPrices}
                                </Badge>
                                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">{relativeImpact.toFixed(0)}% Impact</span>
                             </div>
                             <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                <div 
                                   className="h-full bg-destructive/60 transition-all duration-700" 
                                   style={{ width: `${relativeImpact}%` }}
                                />
                             </div>
                          </div>
                        </td>
                        {/* Readiness */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3 justify-end text-foreground">
                            <div className="flex flex-col items-end gap-1">
                               <span className={cn(
                                  "text-xs tabular-nums font-black leading-none text-foreground text-foreground",
                                  pct === 100 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-destructive"
                               )}>
                                 {pct}%
                               </span>
                               <span className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-tighter">Readiness</span>
                            </div>
                            <div className="w-12 h-12 rounded-full border-4 border-muted flex items-center justify-center p-1 shrink-0 relative">
                               <svg className="w-full h-full -rotate-90">
                                  <circle 
                                     cx="16" cy="16" r="14" 
                                     fill="transparent" 
                                     stroke="currentColor" 
                                     strokeWidth="4" 
                                     className="text-muted/30"
                                  />
                                  <circle 
                                     cx="16" cy="16" r="14" 
                                     fill="transparent" 
                                     stroke="currentColor" 
                                     strokeWidth="4" 
                                     strokeDasharray={88}
                                     strokeDashoffset={88 - (88 * pct) / 100}
                                     className={cn(
                                        "transition-all duration-1000",
                                        pct === 100 ? "text-green-500" : pct >= 70 ? "text-amber-500" : "text-destructive"
                                     )}
                                  />
                               </svg>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {filteredMissing.length > 0 && (
          <div className="px-6 py-3 border-t border-border bg-muted/5 flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            <span>Scan Results: {filteredMissing.length} products found</span>
            {missingQ && <span className="text-primary italic">Filtering active: &quot;{missingQ}&quot;</span>}
          </div>
        )}
      </div>
    </div>
  );
}

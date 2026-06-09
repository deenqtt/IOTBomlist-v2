"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Cpu,
  Package,
  Layers,
  FolderTree,
  BarChart3,
  ShieldCheck,
  KeyRound,
  BookOpen,
  ChevronRight,
  DollarSign,
  Upload,
  Download,
  RefreshCw,
  Search,
  Edit,
  Zap,
  AlertTriangle,
  CheckCircle,

  Info,
  FileText,
  GitMerge,
  Pencil,
  Trash2,
  Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Section {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
}

const SECTIONS: Section[] = [
  { id: "overview",  label: "Overview",     icon: BookOpen,    color: "text-primary bg-primary/10 border-primary/20" },
  { id: "items",     label: "Items",        icon: Cpu,         color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { id: "pcb",       label: "PCB",          icon: Package,     color: "text-green-400 bg-green-500/10 border-green-500/20" },
  { id: "products",  label: "Products",     icon: Layers,      color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  { id: "projects",  label: "Projects",     icon: FolderTree,  color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  { id: "analytics", label: "Analytics",    icon: BarChart3,   color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  { id: "admin",     label: "System Admin", icon: ShieldCheck, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  { id: "apikeys",   label: "API Keys",     icon: KeyRound,    color: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
];

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "info" | "warn" | "ok" }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border",
      variant === "info" && "bg-blue-500/10 text-blue-400 border-blue-500/20",
      variant === "warn" && "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      variant === "ok"   && "bg-green-500/10 text-green-400 border-green-500/20",
      variant === "default" && "bg-muted text-muted-foreground border-border",
    )}>
      {children}
    </span>
  );
}

function Note({ type, children }: { type: "info" | "warn" | "tip"; children: React.ReactNode }) {
  const map = {
    info: { icon: Info,         bg: "bg-blue-500/5 border-blue-500/20 text-blue-300" },
    warn: { icon: AlertTriangle, bg: "bg-yellow-500/5 border-yellow-500/20 text-yellow-300" },
    tip:  { icon: CheckCircle,  bg: "bg-green-500/5 border-green-500/20 text-green-300" },
  };
  const { icon: Icon, bg } = map[type];
  return (
    <div className={cn("flex gap-2.5 px-3.5 py-2.5 rounded-lg border text-xs leading-relaxed", bg)}>
      <Icon size={13} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-black uppercase tracking-widest text-foreground mt-6 mb-3 first:mt-0">{children}</h2>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mt-4 mb-1.5">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed mb-2">{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-1 mb-3 pl-3">{children}</ul>;
}

function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-sm text-muted-foreground leading-relaxed flex gap-2">
      <ChevronRight size={12} className="mt-1 shrink-0 text-primary/60" />
      <span>{children}</span>
    </li>
  );
}

function StepList({ steps }: { steps: { label: string; desc?: string }[] }) {
  return (
    <ol className="space-y-2 mb-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black flex items-center justify-center">
            {i + 1}
          </span>
          <div>
            <span className="text-foreground font-semibold">{s.label}</span>
            {s.desc && <span className="text-muted-foreground ml-1">— {s.desc}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ImagePlaceholder({ id, caption }: { id: string; caption: string }) {
  return (
    <figure className="my-4 rounded-xl border border-border overflow-hidden bg-muted/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/manual/${id}.png`}
        alt={caption}
        className="w-full max-h-[480px] object-contain object-top block bg-muted/10"
      />
      {caption && (
        <figcaption className="px-4 py-2 border-t border-border/50 bg-muted/30">
          <p className="text-[11px] text-muted-foreground/70 text-center italic">{caption}</p>
        </figcaption>
      )}
    </figure>
  );
}


function OverviewSection() {
  return (
    <div>
      <H2>What is IOTBomlist?</H2>
      <P>
        IOTBomlist is an enterprise-grade <strong className="text-foreground">Bill of Materials (BOM) and component inventory management system</strong> built
        for electronics hardware teams. It centralizes component data, connects PCB assemblies to sellable products,
        and delivers real-time cost estimates sourced from live supplier pricing (LCSC, Mouser, DigiKey).
      </P>
      <P>
        Designed for IoT manufacturers, PCB assembly shops, and hardware startups managing multiple product variants
        across production batches.
      </P>

      <H3>Problems It Solves</H3>
      <UL>
        <LI>Scattered component data across spreadsheets — consolidated into one searchable master inventory</LI>
        <LI>Manual price lookups — automated price sync from LCSC, Mouser, and DigiKey</LI>
        <LI>BOM management across product variants — handled via set inheritance (add/remove boards per variant)</LI>
        <LI>Production cost estimation — auto-calculated from live prices, cached for speed</LI>
        <LI>No audit trail — every change logged with who, what, when, and old/new value</LI>
        <LI>Finding drop-in alternatives — alternatives linked per component, cost estimate includes both</LI>
      </UL>

      <H3>The 4-Level Data Hierarchy</H3>
      <div className="space-y-2 mb-4">
        {[
          { level: "1", name: "Item", color: "text-blue-400 bg-blue-500/10 border-blue-500/20", desc: "A unique electronic component in the master inventory. Has a permanent Stable ID, MPN, supplier prices, specs, and stock data. Every component used anywhere must first exist as an Item." },
          { level: "2", name: "PCB", color: "text-green-400 bg-green-500/10 border-green-500/20", desc: "A single circuit board design. Has a BOM — a list of Items with quantities and reference designators (R1, C4, U2...). BOM can be imported from Excel/CSV or built manually. Cost = sum of all item prices × quantities." },
          { level: "3", name: "Product", color: "text-purple-400 bg-purple-500/10 border-purple-500/20", desc: "A sellable product built from one or more PCBs. Supports parent inheritance — a child product starts from a parent's PCB list and adds or removes boards to model variants without duplicating data." },
          { level: "4", name: "Project", color: "text-orange-400 bg-orange-500/10 border-orange-500/20", desc: "A production batch or deployment plan grouping multiple Products. Shows total cost, per-product breakdown, and Budget Drainers — the top 10 components driving the most spend across the entire project." },
        ].map(({ level, name, color, desc }) => (
          <div key={level} className="flex gap-3 p-3 rounded-lg border border-border bg-card/50">
            <div className={`flex-shrink-0 w-7 h-7 rounded-lg border text-[11px] font-black flex items-center justify-center ${color}`}>
              {level}
            </div>
            <div>
              <span className="text-sm font-bold text-foreground">{name}</span>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <H3>Data Flow</H3>
      <div className="flex flex-wrap gap-1.5 items-center text-xs text-muted-foreground mt-2 mb-4">
        {["Items", "→", "PCB BOM", "→", "Product", "→", "Project", "→", "Cost Estimate"].map((t, i) => (
          t === "→"
            ? <ChevronRight key={i} size={12} className="text-primary/40" />
            : <span key={i} className="px-2 py-1 rounded bg-muted border border-border font-medium text-foreground text-[11px]">{t}</span>
        ))}
      </div>

      <H3>Key Features</H3>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {[
          { icon: Search,     label: "Smart Search",        desc: "Search items by MPN, description, manufacturer, or Stable ID. Filter by supplier, category, package." },
          { icon: DollarSign, label: "Live Cost Estimates",  desc: "Auto-calculated from real supplier prices. Cached for speed, invalidated when data changes." },
          { icon: RefreshCw,  label: "Price Sync",          desc: "Batch-fetch latest prices from LCSC, Mouser, DigiKey for all items. Runs as background job." },
          { icon: Upload,     label: "BOM Import",          desc: "Upload Excel or CSV Pick & Place files. Auto-match to existing items or create new ones." },
          { icon: Layers,     label: "Set Inheritance",     desc: "Product variants inherit from a parent. Add/remove PCBs per variant — no duplication." },
          { icon: Zap,        label: "Budget Drainers",     desc: "Identify top 10 most expensive components driving project cost. Guide cost-down decisions." },
          { icon: Download,   label: "BOM Export",          desc: "Export full BOM as formatted Excel from any level: PCB, Product, or Project." },
          { icon: Edit,       label: "Audit Log",           desc: "Every change tracked — who changed what, when, and what the old value was." },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="p-2.5 rounded-lg border border-border bg-card/50">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={11} className="text-primary" />
              <span className="text-[11px] font-black text-foreground uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <H3>Typical Workflow</H3>
      <StepList steps={[
        { label: "Import component data",       desc: "upload backup Excel or add items manually" },
        { label: "Run Price Sync",              desc: "Admin → Price Sync — fetches prices from LCSC/Mouser/DigiKey for all items" },
        { label: "Build PCB BOMs",              desc: "create PCB entries, import BOM from Pick & Place file" },
        { label: "Create Products",             desc: "bundle PCBs into sellable products, use inheritance for variants" },
        { label: "Group into Projects",         desc: "create a project for each production batch, add products with quantities" },
        { label: "Review Analytics",            desc: "check cost estimates, missing prices, budget drainers, supplier distribution" },
        { label: "Export BOM",                  desc: "download full BOM for procurement or production" },
      ]} />

      <H3>Supplier Integrations</H3>
      <div className="flex flex-wrap gap-2 mb-3">
        {[
          { name: "LCSC",    note: "via JLC sidecar (built-in)",   color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
          { name: "Mouser",  note: "API key required",             color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
          { name: "DigiKey", note: "OAuth2 — Client ID + Secret",  color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
        ].map(({ name, note, color }) => (
          <div key={name} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${color}`}>
            <span className="font-black">{name}</span>
            <span className="opacity-60">{note}</span>
          </div>
        ))}
      </div>

      <H3>User Roles</H3>
      <div className="space-y-1.5 mb-3">
        {[
          { role: "viewer",  color: "bg-muted text-muted-foreground border-border",              desc: "Read-only. Can view all data but cannot create, edit, or delete." },
          { role: "editor",  color: "bg-blue-500/10 text-blue-400 border-blue-500/20",           desc: "Can create and edit items, PCBs, products, and projects." },
          { role: "admin",   color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",     desc: "Full access. Manage warehouse, run price sync, view audit log, manage users." },
          { role: "super",   color: "bg-green-500/10 text-green-400 border-green-500/20",        desc: "Everything admin can + manage API keys, backup/restore, system settings." },
        ].map(({ role, color, desc }) => (
          <div key={role} className="flex gap-3 items-start text-xs">
            <span className={`flex-shrink-0 px-1.5 py-0.5 rounded border font-black uppercase tracking-wider ${color}`}>{role}</span>
            <span className="text-muted-foreground leading-relaxed pt-0.5">{desc}</span>
          </div>
        ))}
      </div>

      <Note type="tip">
        Start with the <strong>Items</strong> section to understand how components are structured, then move to <strong>PCB</strong> to learn BOM management.
      </Note>
    </div>
  );
}

function ItemsSection() {
  return (
    <div>
      <H2>Items — Component Inventory</H2>
      <P>
        The Items tab is your <strong className="text-foreground">master inventory of all electronic components</strong> — resistors, capacitors, ICs, connectors, modules, and anything else that goes onto a PCB.
        Every component used in any PCB BOM must first exist here. Think of it as a central parts library shared across all your products.
      </P>
      <P>
        Each item stores not just identification data (MPN, manufacturer) but also live supplier prices, stock levels, technical specs, and links to drop-in alternative parts.
      </P>

      <ImagePlaceholder id="IMG_ITEMS_TABLE" caption="Items table — full view with supplier badges, unit prices, and stock indicators" />

      <H3>Table Columns</H3>
      <div className="space-y-1.5 mb-4">
        {[
          { col: "Stable ID",     desc: "Unique permanent hex identifier assigned at creation. Never changes — safe to use as a reference across imports and exports." },
          { col: "MPN",           desc: "Manufacturer Part Number. This is the actual part number from the maker (e.g. ERJ-3EKF10R0V), not the supplier catalog number." },
          { col: "Manufacturer",  desc: "Brand that makes the component (e.g. Panasonic, Texas Instruments, Amphenol)." },
          { col: "Category",      desc: "Component type — Resistor, Capacitor, IC, Connector, Module, etc." },
          { col: "Package",       desc: "Physical footprint — 0402, 0603, SOT-23, DIP-8, QFN-32, Through Hole, etc." },
          { col: "Value",         desc: "Electrical value — 100nF, 10kΩ, 5V, 10µH. Used for alternative matching." },
          { col: "Specs",         desc: "Voltage Rating · Tolerance pair (e.g. \"50V · ±5%\"). Extracted from supplier data." },
          { col: "Unit Price",    desc: "Cheapest available price across all configured suppliers in USD." },
          { col: "Suppliers",     desc: "Colored badges for each supplier with stock: LCSC (blue), Mouser (green), DigiKey (orange). The best in-stock supplier has a checkmark ring. Click a badge to open the supplier product page." },
          { col: "Market Stock",  desc: "Available stock at the cheapest supplier. Pulses red if zero stock everywhere." },
        ].map(({ col, desc }) => (
          <div key={col} className="flex gap-3 text-xs">
            <span className="font-mono font-bold text-foreground shrink-0 w-28 pt-0.5">{col}</span>
            <span className="text-muted-foreground leading-relaxed">{desc}</span>
          </div>
        ))}
      </div>

      <H3>Search & Filter</H3>
      <P>Use the filter bar above the table to narrow down components:</P>
      <UL>
        <LI><strong className="text-foreground">Search</strong> — real-time search by Part Number, manufacturer name, or Stable ID</LI>
        <LI><strong className="text-foreground">Category</strong> — filter by component type (Resistor, Capacitor, etc.)</LI>
        <LI><strong className="text-foreground">Package</strong> — filter by footprint. Cascades from Category — selecting a category limits the package options</LI>
        <LI><strong className="text-foreground">Supplier</strong> — show only items available at a specific supplier</LI>
      </UL>
      <P>Active filters appear as chips below the filter bar — click the × on any chip to remove it, or use Clear All.</P>

      <H3>Adding a Component</H3>
      <P>
        Click the <strong className="text-foreground">Add Component</strong> button (top right, visible to admins). The process has 3 steps:
      </P>

      <div className="space-y-4 mb-4">
        {/* Step 1 */}
        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black flex items-center justify-center shrink-0">1</span>
            <span className="text-xs font-black uppercase tracking-wider text-foreground">Search MPN</span>
          </div>
          <div className="px-4 py-3 text-sm text-muted-foreground leading-relaxed">
            Enter the <strong className="text-foreground">Manufacturer Part Number</strong> (required) and optionally the manufacturer name. Click <em>Search LCSC, Mouser &amp; DigiKey</em> — the system checks all 3 suppliers simultaneously and alerts you if the part already exists in your inventory.
          </div>
          <ImagePlaceholder id="IMG_ITEMS_ADD_STEP1" caption="Step 1 — MPN search input" />
        </div>

        {/* Step 2 */}
        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black flex items-center justify-center shrink-0">2</span>
            <span className="text-xs font-black uppercase tracking-wider text-foreground">Pick Supplier Source(s)</span>
          </div>
          <div className="px-4 py-3 space-y-2 text-sm text-muted-foreground leading-relaxed">
            <p>Results appear in tabs: <strong className="text-foreground">LCSC | Mouser | DigiKey | Other</strong>. Each tab shows up to 10 matches with price, MOQ, and stock. Click a result to select it — you can select from multiple tabs to link the same component across multiple suppliers.</p>
            <p>The <strong className="text-foreground">Other</strong> tab is for suppliers not in the API list (Tokopedia, AliExpress, etc.) — enter the product URL and price manually.</p>
          </div>
          <ImagePlaceholder id="IMG_ITEMS_ADD_STEP2" caption="Step 2 — Supplier tabs with search results (LCSC, Mouser, DigiKey)" />
        </div>

        {/* Step 3 */}
        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black flex items-center justify-center shrink-0">3</span>
            <span className="text-xs font-black uppercase tracking-wider text-foreground">Fill Details &amp; Save</span>
          </div>
          <div className="px-4 py-3 text-sm text-muted-foreground leading-relaxed">
            Fields are <strong className="text-foreground">auto-filled</strong> from the supplier results you selected. Review and adjust: Stable ID (auto-generated), Part Number, Manufacturer, Category, Package, Value, Voltage Rating, Tolerance, Price Min, Stock Qty, Warehouse Location, and Datasheet URL. Click <em>Save</em> to create the component.
          </div>
          <ImagePlaceholder id="IMG_ITEMS_ADD_STEP3" caption="Step 3 — Details form auto-filled from supplier data" />
        </div>
      </div>

      <Note type="tip">
        You don&apos;t need to fill everything manually — just search and select from a supplier in Step 2, and most fields populate automatically. Run <strong>Price Sync</strong> later to keep prices updated.
      </Note>

      <H3>Row Actions</H3>
      <P>Hover over any row to reveal action buttons on the right:</P>
      <div className="space-y-2 mb-4">
        {[
          { icon: FileText,  color: "text-muted-foreground", label: "Open Datasheet",   desc: "Opens the component datasheet or product page in a new browser tab (if a link is stored)." },
          { icon: Zap,       color: "text-blue-400",         label: "Live Price Lookup", desc: "Opens the Price Lookup panel — fetches fresh prices from all suppliers right now and lets you apply the result to the item." },
          { icon: GitMerge,  color: "text-violet-400",       label: "Find Alternatives", desc: "Opens the Alternatives panel — searches for drop-in replacement components by matching Value, Package, and Voltage Rating. Link found alternatives to this item." },
          { icon: Pencil,    color: "text-foreground",       label: "Edit",              desc: "Opens the edit form. Admin only." },
          { icon: Trash2,    color: "text-destructive",      label: "Delete",            desc: "Deletes the component after confirmation. Admin only. Cannot delete items currently in use by a PCB BOM." },
        ].map(({ icon: Icon, color, label, desc }) => (
          <div key={label} className="flex gap-3 text-xs items-start">
            <div className={`shrink-0 w-6 h-6 rounded-lg border border-border bg-muted/40 flex items-center justify-center mt-0.5 ${color}`}>
              <Icon size={11} />
            </div>
            <div>
              <span className="font-bold text-foreground">{label}</span>
              <span className="text-muted-foreground ml-1.5">{desc}</span>
            </div>
          </div>
        ))}
      </div>

      <H3>Price Lookup Panel</H3>
      <P>
        Click the <Zap size={11} className="inline text-blue-400 mx-0.5" /> icon on any row to open the Price Lookup panel. It fetches the latest prices from LCSC, Mouser, and DigiKey in real time and shows them side by side.
        Click <strong className="text-foreground">Apply to Item</strong> on any result to update that item&apos;s stored price and supplier data immediately — no need to run a full Price Sync.
      </P>
      <ImagePlaceholder id="IMG_ITEMS_PRICELOOKUP" caption="Price Lookup panel — live supplier results with Apply button" />

      <H3>Alternatives Panel</H3>
      <P>
        Click the <GitMerge size={11} className="inline text-violet-400 mx-0.5" /> icon to open the Alternatives panel. It searches for components that could replace the selected item based on matching electrical properties.
        Use the filter chips to control which properties must match (Category, Value, Package, Voltage Rating, Tolerance).
        Click <strong className="text-foreground">Save &amp; Link</strong> on a result to create the alternative component in your inventory and link it to the original — from then on, cost estimates will show both primary and alternative pricing.
      </P>
      <ImagePlaceholder id="IMG_ITEMS_ALTERNATIVES" caption="Alternatives panel — search results with Save & Link action" />

      <H3>Editing a Component</H3>
      <P>Click the <Pencil size={11} className="inline mx-0.5" /> pencil icon (admin only) to open the edit form. It has 5 sections:</P>
      <UL>
        <LI><strong className="text-foreground">Identification</strong> — Stable ID (locked), MPN, Manufacturer, Product Name</LI>
        <LI><strong className="text-foreground">Component Properties</strong> — Category, Package, Value, Voltage Rating, Tolerance, Description</LI>
        <LI><strong className="text-foreground">Supplier Part Numbers</strong> — separate PN field for LCSC, Mouser, DigiKey, and Other</LI>
        <LI><strong className="text-foreground">Pricing &amp; Stock</strong> — Price Min, Currency, Stock Qty, Warehouse Location, Datasheet link</LI>
        <LI><strong className="text-foreground">Specs (DigiKey)</strong> — technical attributes fetched from DigiKey. Click <em>Enrich from DigiKey</em> to pull the latest specs for this MPN</LI>
      </UL>

      <Note type="warn">
        Editing a component&apos;s price or supplier data will automatically invalidate all est. cost caches. Costs will recalculate the next time you open Analytics or any product/project page.
      </Note>
    </div>
  );
}

function PCBSection() {
  return (
    <div>
      <H2>PCB — Bill of Materials per Board</H2>
      <P>
        The PCB tab manages individual circuit board designs. Each PCB has a <strong className="text-foreground">Bill of Materials (BOM)</strong> — the complete list of components needed to build one unit of that board, with quantities and reference designators (R1, C4, U2, etc.).
      </P>
      <P>
        PCBs are the building blocks of Products — one product can include multiple PCBs, each with its own BOM.
      </P>

      <ImagePlaceholder id="IMG_PCB_LIST" caption="PCB list — showing name, item count, estimated cost, and last updated date" />

      <H3>PCB List</H3>
      <P>The main PCB page shows all your boards in a table with these columns:</P>
      <div className="space-y-1.5 mb-4">
        {[
          { col: "PCB Name",    desc: "Board name with thumbnail image. Click the name or Inspect button to open the BOM." },
          { col: "Items",       desc: "Count of unique components in this board's BOM." },
          { col: "Est. Cost",   desc: "Total cost for one unit (sum of all item prices × qty). Shows alternative cost if cheaper alternatives are linked." },
          { col: "Last Updated", desc: "Date the BOM was last modified." },
          { col: "Actions",     desc: "Inspect (open BOM), Edit BOM, Rename, Delete — admin only for edit/delete." },
        ].map(({ col, desc }) => (
          <div key={col} className="flex gap-3 text-xs">
            <span className="font-mono font-bold text-foreground shrink-0 w-28 pt-0.5">{col}</span>
            <span className="text-muted-foreground leading-relaxed">{desc}</span>
          </div>
        ))}
      </div>

      <H3>BOM Table (Inside a PCB)</H3>
      <P>Click a PCB name to open its detail page. The BOM table shows all components with these columns:</P>
      <div className="space-y-1.5 mb-3">
        {[
          { col: "Stable ID",   desc: "Permanent component identifier." },
          { col: "Part Number", desc: "MPN with status badges: NEED ALT (red, out of stock with no alternative), HAS ALT (amber, has linked alternatives), TEMP (yellow, temporary alternative applied)." },
          { col: "Value / Specs", desc: "Electrical value and package on two lines (e.g. 100k / 0603)." },
          { col: "Suppliers",   desc: "Colored supplier badges. Active best-price supplier has a checkmark." },
          { col: "Unit Price",  desc: "Price per unit from the best available supplier." },
          { col: "Qty",         desc: "Quantity needed per PCB assembly. Editable inline." },
          { col: "Stock",       desc: "Available stock at best supplier. Pulses red if zero." },
          { col: "References",  desc: "Reference designators (R1, R2, C4…). Editable inline." },
        ].map(({ col, desc }) => (
          <div key={col} className="flex gap-3 text-xs">
            <span className="font-mono font-bold text-foreground shrink-0 w-24 pt-0.5">{col}</span>
            <span className="text-muted-foreground leading-relaxed">{desc}</span>
          </div>
        ))}
      </div>

      <ImagePlaceholder id="IMG_PCB_DETAIL" caption="PCB detail page — BOM table with component rows, supplier badges, stock indicators" />

      <H3>Importing a BOM</H3>
      <P>
        Click <strong className="text-foreground">Import BOM</strong> (top-right dropdown inside a PCB) to upload a BOM file. Accepts <code className="font-mono text-xs bg-muted px-1 rounded">.csv</code>, <code className="font-mono text-xs bg-muted px-1 rounded">.xlsx</code>, or <code className="font-mono text-xs bg-muted px-1 rounded">.xls</code>. The import is a 4-step wizard:
      </P>

      <Note type="tip">
        No strict column name required — the system auto-detects columns that contain <strong>description</strong> or <strong>qty</strong> in the header name.
        Recommended columns: <code className="font-mono text-xs bg-muted px-1 rounded">Description</code>, <code className="font-mono text-xs bg-muted px-1 rounded">Qty</code>, <code className="font-mono text-xs bg-muted px-1 rounded">Remarks</code>.
      </Note>

      <div className="space-y-3 mb-4">
        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black flex items-center justify-center shrink-0">1</span>
            <span className="text-xs font-black uppercase tracking-wider text-foreground">Upload File</span>
          </div>
          <div className="px-4 py-3 text-sm text-muted-foreground leading-relaxed">
            Drag-and-drop or click to upload your BOM file. Optionally upload a separate <strong className="text-foreground">Reference File</strong> for designator data (R1, C4, etc.) if it is in a separate file. The system shows the detected row count after upload.
          </div>
          <ImagePlaceholder id="IMG_PCB_IMPORT_UPLOAD" caption="Step 1 — File upload dropzone" />
        </div>

        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black flex items-center justify-center shrink-0">2</span>
            <span className="text-xs font-black uppercase tracking-wider text-foreground">Map Columns</span>
          </div>
          <div className="px-4 py-3 text-sm text-muted-foreground leading-relaxed space-y-1.5">
            <p>Tell the system which column in your file maps to which field:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
              {[
                ["Identifier / Description", "Required — the MPN or part identifier column"],
                ["Quantity", "Required — how many per board"],
                ["Description (MPN source)", "Optional — additional MPN data"],
                ["URL / Link / Remarks", "Optional — supplier or datasheet URL"],
                ["Notes", "Optional — assembly notes"],
              ].map(([field, note]) => (
                <div key={field} className="contents">
                  <span className="font-bold text-foreground">{field}</span>
                  <span className="text-muted-foreground">{note}</span>
                </div>
              ))}
            </div>
          </div>
          <ImagePlaceholder id="IMG_PCB_IMPORT_MAP" caption="Step 2 — Column mapping dropdowns" />
        </div>

        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black flex items-center justify-center shrink-0">3</span>
            <span className="text-xs font-black uppercase tracking-wider text-foreground">Review Missing Items</span>
          </div>
          <div className="px-4 py-3 text-sm text-muted-foreground leading-relaxed">
            The system searches your existing inventory for each component in the file. Items already in the database are matched automatically. For items not yet in inventory, you can:
            <div className="mt-2 space-y-1">
              <div className="flex gap-2"><Badge variant="ok">Found</Badge><span>Match confirmed — will be linked</span></div>
              <div className="flex gap-2"><Badge variant="info">Add</Badge><span>Not in inventory yet — click Add to create it</span></div>
              <div className="flex gap-2"><Badge>Skip</Badge><span>Exclude this item from the import</span></div>
            </div>
            <p className="mt-2">Use <strong className="text-foreground">Confirm All Found</strong> and <strong className="text-foreground">Skip All</strong> for bulk actions.</p>
          </div>
          <ImagePlaceholder id="IMG_PCB_IMPORT_REVIEW" caption="Step 3 — Review list showing found, not-found, and skipped items" />
        </div>

        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black flex items-center justify-center shrink-0">4</span>
            <span className="text-xs font-black uppercase tracking-wider text-foreground">Summary &amp; Execute</span>
          </div>
          <div className="px-4 py-3 text-sm text-muted-foreground leading-relaxed">
            Shows a final count: <strong className="text-foreground">Will Import</strong> / <strong className="text-foreground">New Items Added</strong> / <strong className="text-foreground">Skipped</strong>. Click <em>Start Import</em> to execute.
          </div>
          <ImagePlaceholder id="IMG_PCB_IMPORT_SUMMARY" caption="Step 4 — Summary with import/skip counts before final confirmation" />
        </div>
      </div>

      <Note type="info">
        New items created during BOM import have minimal data (just MPN and quantity). Run <strong>Admin → Price Sync</strong> afterward to enrich them with prices, specs, and stock from suppliers.
      </Note>

      <H3>Adding a Component Manually</H3>
      <P>Click <strong className="text-foreground">Add Component</strong> (top-right, admin only). A 2-step modal opens:</P>
      <StepList steps={[
        { label: "Search inventory", desc: "search by Part Number, Stable ID, or value — results show from your existing Items" },
        { label: "Set quantity & references", desc: "enter how many are needed per board and the reference designators (R1, R2…)" },
      ]} />
      <Note type="warn">
        Only items that already exist in the Items inventory can be added here. If the component is not yet in inventory, add it via the Items tab first.
      </Note>

      <H3>Editing a BOM Row</H3>
      <P>Hover over a row and click the <Pencil size={11} className="inline mx-0.5" /> pencil icon to enter inline edit mode. Two fields become editable:</P>
      <UL>
        <LI><strong className="text-foreground">Qty</strong> — number of this component per assembly</LI>
        <LI><strong className="text-foreground">References</strong> — comma-separated designators (R1, R2, C4…)</LI>
      </UL>
      <P>Click the green checkmark to save, or X to cancel.</P>

      <H3>Removing a Component from BOM</H3>
      <P>
        Hover over a row → click the red <Trash2 size={11} className="inline mx-0.5 text-destructive" /> trash icon → confirm in the dialog.
        This only removes the component from this PCB&apos;s BOM — it does <strong className="text-foreground">not</strong> delete the Item from the master inventory.
      </P>
      <P>For bulk removal: select multiple rows using the checkboxes (admin only), then click <strong className="text-foreground">Remove Selected</strong> in the floating bar at the bottom.</P>

      <H3>Exporting BOM</H3>
      <P>Click the <strong className="text-foreground">Export</strong> dropdown (top-right of a PCB). Three options:</P>
      <div className="space-y-1.5 mb-3">
        {[
          { opt: "Normal BOM",           desc: "Excel export of the full BOM — one row per component with qty, price, supplier, references." },
          { opt: "BOM with Alternatives", desc: "Same as Normal BOM but includes linked alternative part numbers per row." },
          { opt: "Export Reference",      desc: "Excel with only reference designators per component — useful for assembly instructions." },
        ].map(({ opt, desc }) => (
          <div key={opt} className="flex gap-3 text-xs">
            <span className="font-bold text-foreground shrink-0 w-36">{opt}</span>
            <span className="text-muted-foreground">{desc}</span>
          </div>
        ))}
      </div>
      <ImagePlaceholder id="IMG_PCB_EXPORT" caption="Export dropdown — Normal BOM, BOM with Alternatives, Export Reference" />
      <Note type="warn">
        If any component has zero stock and no linked alternative, the system shows a warning before export — you can still proceed or fix the issue first.
      </Note>

      <H3>Cost Estimate</H3>
      <P>
        The PCB detail page shows 4 stat cards at the top: <strong className="text-foreground">Total Rows</strong>, <strong className="text-foreground">Unique Parts</strong>, <strong className="text-foreground">Total Quantity</strong>, and <strong className="text-foreground">Estimated Cost</strong>.
        Cost = <code className="font-mono text-xs bg-muted px-1 rounded">Σ (unit price × qty)</code> for all BOM rows.
        Items with no price are counted as missing and shown as a warning.
      </P>
      <P>
        On the PCB list, the cost column also shows an <strong className="text-foreground">Alt cost</strong> — the price if all alternative components are used instead (green, shown only when cheaper).
      </P>

      <H3>Finding Alternatives per Row</H3>
      <P>
        Click the <GitMerge size={11} className="inline text-violet-400 mx-0.5" /> icon on any BOM row to open the Alternatives panel for that specific component. Same as the one in the Items tab — search for drop-in replacements and link them.
      </P>
      <P>
        On the BOM page you also have a <strong className="text-foreground">Use Temporarily</strong> option — this applies an alternative for export purposes only, without saving to the database. The row shows a yellow <code className="font-mono text-xs bg-muted px-1 rounded">TEMP</code> badge. Useful for one-off procurement decisions.
      </P>

      <H3>Other Tabs</H3>
      <UL>
        <LI><strong className="text-foreground">Usage in Sets</strong> — shows which Products (Sets) include this PCB, with quantity and operation type</LI>
        <LI><strong className="text-foreground">Files</strong> — upload and manage Pick &amp; Place files, schematics, or other documents for this PCB</LI>
      </UL>
    </div>
  );
}

function ProductsSection() {
  return (
    <div>
      <H2>Products — Multi-PCB Configurations</H2>
      <P>
        A <strong>Product</strong> (internally called a &quot;Set&quot;) bundles multiple PCBs into one sellable or manufacturable unit.
        Example: a &quot;Controller Kit&quot; might include a Main Board PCB × 1, a Power Board PCB × 1, and a Display Module PCB × 2.
        Products support inheritance — a child Product can extend a parent&apos;s PCB list without duplicating it.
      </P>

      <ImagePlaceholder id="IMG_PRODUCTS_LIST" caption="Products list — showing Product Name, Base Product badge, PCB count, Est. Cost, and Actions" />

      <H3>Products List Columns</H3>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 pr-4 font-semibold text-muted-foreground">Column</th>
              <th className="text-left py-1.5 font-semibold text-muted-foreground">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            <tr><td className="py-1.5 pr-4 font-medium">Product Name</td><td className="py-1.5 text-muted-foreground">Display name — click row to open side panel</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Base Product</td><td className="py-1.5 text-muted-foreground">Parent product badge (if this product inherits from another)</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">PCBs</td><td className="py-1.5 text-muted-foreground">Count of PCBs included in this product</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Est. Cost</td><td className="py-1.5 text-muted-foreground">Estimated BOM cost (USD) — sum of all included PCB costs</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Created By</td><td className="py-1.5 text-muted-foreground">Username who created this product</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Notes</td><td className="py-1.5 text-muted-foreground">Free-text notes (truncated in list, full in side panel)</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Actions</td><td className="py-1.5 text-muted-foreground">Edit, Export BOM, Delete</td></tr>
          </tbody>
        </table>
      </div>

      <H3>Side Panel</H3>
      <P>
        Click any product row to open a side panel on the right. Panel shows the full PCB composition list —
        each PCB with its name, quantity, and item count. Useful for quick review without opening the edit page.
      </P>

      <H3>Creating a Product</H3>
      <StepList steps={[
        { label: "Click \"New Product\" button", desc: "top-right of the Products page" },
        { label: "Enter Product Name", desc: "required — e.g. \"Controller v2 Full Kit\"" },
        { label: "Enter Notes (optional)", desc: "version notes, SKU, or production context" },
        { label: "Add PCBs to composition", desc: "click \"+ Add PCB\" row — select PCB from dropdown, set quantity" },
        { label: "Repeat for each PCB", desc: "use +/- buttons or type qty directly" },
        { label: "Save", desc: "product created, Est. Cost calculated immediately" },
      ]} />

      <ImagePlaceholder id="IMG_PRODUCTS_NEW" caption="New Product form — left: name/notes + PCB rows, right: cost summary sidebar" />

      <H3>PCB Composition</H3>
      <P>Each row in the composition represents one PCB included in this product:</P>
      <UL>
        <LI><strong>PCB dropdown</strong> — select which PCB (product) to include</LI>
        <LI><strong>Item count badge</strong> — shows how many components are on that PCB (read-only)</LI>
        <LI><strong>Qty control</strong> — how many units of that PCB go into one Product unit (+ / − / direct input)</LI>
        <LI><strong>Delete button</strong> — remove that PCB from the composition</LI>
      </UL>

      <Note type="tip">
        Cost sidebar (right column) updates live as PCBs are added or removed. It shows a breakdown:
        PCB name → individual cost → subtotal with quantity multiplied.
      </Note>

      <H3>Product Inheritance (Base Product)</H3>
      <P>
        A Product can declare another Product as its <strong>Base Product</strong> (parent).
        It inherits the parent&apos;s full PCB composition automatically — displayed as a &quot;Base Product&quot; badge in the list.
      </P>
      <Note type="warn">
        Inheritance is set when creating/editing the product via the &quot;Base Product&quot; field.
        Child products show the inherited PCBs — they cannot be removed from the child,
        only additional PCBs can be added on top.
      </Note>
      <Note type="tip">
        Use case: &quot;Controller Base&quot; has Main Board + Power Board. &quot;Controller Premium&quot; inherits Base and adds a Display Module.
        Updating Main Board cost in Items → automatically propagates to Base cost → propagates to Premium cost.
      </Note>

      <H3>BOM Export</H3>
      <P>Click the export icon in the Actions column. Three export modes available:</P>
      <div className="space-y-2 mb-4">
        <div className="rounded-lg border border-border px-3 py-2">
          <p className="text-xs font-semibold">Original (per PCB)</p>
          <p className="text-xs text-muted-foreground mt-0.5">Separate sheet per PCB — preserves original BOM structure. Best for factory handoff where each PCB is assembled separately.</p>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <p className="text-xs font-semibold">Combined (merged)</p>
          <p className="text-xs text-muted-foreground mt-0.5">All PCBs merged into one sheet — same parts consolidated, quantities summed across boards. Best for purchasing / sourcing.</p>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <p className="text-xs font-semibold">Alternative (alt parts)</p>
          <p className="text-xs text-muted-foreground mt-0.5">Includes alternative component options alongside primary parts. Best for procurement flexibility when primary parts are out of stock.</p>
        </div>
      </div>

      <H3>Est. Cost</H3>
      <P>
        Product Est. Cost = sum of (PCB cost × qty) for every PCB in the composition.
        PCB cost itself = sum of item unit prices × per-item quantity on that board.
        Costs are cached — run <strong>Admin → Price Sync</strong> to refresh supplier prices and recalculate.
      </P>
    </div>
  );
}

function ProjectsSection() {
  return (
    <div>
      <H2>Projects — Batch Deployment Scope</H2>
      <P>
        A <strong>Project</strong> (internally a &quot;Superset&quot;) bundles multiple Products together for a large-scale production run or deployment scope.
        Example: &quot;Jakarta Hub Phase 2&quot; ships 50× Controller Kit + 20× Power Unit + 5× Gateway Board.
        A Project calculates total BOM cost across all Product variants and quantities.
      </P>

      <ImagePlaceholder id="IMG_PROJECTS_LIST" caption="Projects list — Project Name, Products count, Est. Cost, Target Quote, Created By, Notes, Actions" />

      <H3>Projects List Columns</H3>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 pr-4 font-semibold text-muted-foreground">Column</th>
              <th className="text-left py-1.5 font-semibold text-muted-foreground">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            <tr><td className="py-1.5 pr-4 font-medium">Project Name</td><td className="py-1.5 text-muted-foreground">Click row to open side panel with full composition</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Products</td><td className="py-1.5 text-muted-foreground">Number of Product types included</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Est. Cost</td><td className="py-1.5 text-muted-foreground">Total BOM cost — Σ (product unit cost × qty)</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Target Quote</td><td className="py-1.5 text-muted-foreground">Auto-calculated: Est. Cost ÷ (1 − 25% margin). Reference only.</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Created By</td><td className="py-1.5 text-muted-foreground">Username who created this project</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Notes</td><td className="py-1.5 text-muted-foreground">Free-text notes (e.g. deployment region, PO number)</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Actions</td><td className="py-1.5 text-muted-foreground">Rename, Delete (hover to reveal)</td></tr>
          </tbody>
        </table>
      </div>

      <H3>Side Panel</H3>
      <P>
        Click a project row to open a side panel. Panel shows all Products in the project with their
        PCB Assembly count, Unit Cost, and Total Qty. Bottom of panel has a
        <strong> Download Project BOM (Excel)</strong> button — exports all Products merged into one master BOM file.
      </P>

      <H3>Creating a Project</H3>
      <StepList steps={[
        { label: "Click \"New Project\" button", desc: "top-right of the Projects page" },
        { label: "Enter Project Name", desc: "required — e.g. \"Jakarta Hub Phase 2\"" },
        { label: "Enter Notes (optional)", desc: "deployment region, batch ID, customer ref" },
        { label: "Add Products to composition", desc: "click \"Add Product\" — select Product from dropdown" },
        { label: "Set quantity per Product", desc: "how many units of that Product variant in this run" },
        { label: "Repeat for each Product variant", desc: "use +/- buttons or type qty directly" },
        { label: "Click \"Create Project\"", desc: "redirects to project detail page" },
      ]} />

      <ImagePlaceholder id="IMG_PROJECTS_NEW" caption="New Project form — left: name/notes + product rows, right: project summary sidebar" />

      <H3>Product Composition</H3>
      <P>Each row in the project composition:</P>
      <UL>
        <LI><strong>Product dropdown</strong> — select which Product (Set) to include</LI>
        <LI><strong>PCB Assemblies badge</strong> — number of PCBs inside the selected Product</LI>
        <LI><strong>Qty control</strong> — how many units of that Product go into this project run</LI>
        <LI><strong>Delete button</strong> — remove from project</LI>
      </UL>
      <P>Summary sidebar on the right shows: Product Types count, Total Deployment (total quantity across all products), and a breakdown list per product.</P>

      <H3>BOM Export</H3>
      <P>
        Open side panel → click <strong>Download Project BOM (Excel)</strong>.
        Exports all Products merged into one Excel file — all PCBs across all Products, quantities multiplied out.
        Use this for purchasing or factory handoff at the project/batch level.
      </P>

      <H3>Est. Cost</H3>
      <P>
        Project Est. Cost = Σ (Product unit cost × qty per product) for all rows.
        Refresh via <strong>Admin → Price Sync</strong> to get updated supplier prices before quoting.
      </P>

      <Note type="info">
        Target Quote column (25% margin) is a quick reference — not configurable per-project. Use it as a starting point for actual customer quotes.
      </Note>
    </div>
  );
}

function AnalyticsSection() {
  return (
    <div>
      <H2>Analytics — Intelligence Center</H2>
      <P>
        Analytics (labelled <em>Intelligence Center</em> in the UI) gives a cross-cutting financial and inventory view
        across all Items, PCBs, Products, and Projects.
        Use it to find cost drivers, spot coverage gaps, and assess production readiness before quoting.
      </P>

      <ImagePlaceholder id="IMG_ANALYTICS_OVERVIEW" caption="Analytics overview — 4 metric cards + Category Density and Supplier Distribution charts" />

      <H3>Summary Metric Cards</H3>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 pr-4 font-semibold text-muted-foreground">Card</th>
              <th className="text-left py-1.5 font-semibold text-muted-foreground">What it shows</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            <tr><td className="py-1.5 pr-4 font-medium">Total Component Registry</td><td className="py-1.5 text-muted-foreground">Total unique parts in the Items database</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Price Enrichment</td><td className="py-1.5 text-muted-foreground">% of items with a supplier price assigned — higher is better</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Production Pipeline</td><td className="py-1.5 text-muted-foreground">Number of active Projects (Supersets)</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Inventory Intelligence Gap</td><td className="py-1.5 text-muted-foreground">Items missing prices — these create blind spots in cost estimates</td></tr>
          </tbody>
        </table>
      </div>

      <H3>Charts</H3>
      <UL>
        <LI><strong>Category Density</strong> — horizontal bar chart, items per component category (Resistor, Capacitor, IC, etc.). Shows distribution of inventory by type. Configurable: top 5/10/15/20 categories.</LI>
        <LI><strong>Supplier Distribution</strong> — bar chart showing how many items have prices from each supplier (LCSC, Mouser, DigiKey). Highlights over-reliance on a single supplier.</LI>
      </UL>

      <H3>Project Health Table</H3>
      <P>
        Per-PCB (product) coverage table — shows each PCB with BOM row count, how many are priced vs. missing.
        Sortable by coverage % or missing count. Use this to prioritize which PCBs need price data before a project kicks off.
      </P>
      <Note type="tip">
        If all PCBs show 100% coverage, the table is hidden and a green confirmation is shown — no action needed.
      </Note>

      <H3>Missing Price Impact Table</H3>
      <P>
        Below the health table: per-product breakdown of BOM rows with missing prices.
        Sortable by <strong>Gap Impact</strong> (count of missing prices) or <strong>Coverage %</strong>.
        Searchable by product name. Use this to identify which product needs the most attention before a price sync.
      </P>

      <H3>Refresh</H3>
      <P>
        Click the refresh icon (top-right) to re-fetch all analytics data.
        Analytics data is cached — a refresh forces re-query from the database.
        For price updates, use <strong>Admin → Price Sync</strong> first, then refresh Analytics.
      </P>
    </div>
  );
}

function AdminSection() {
  return (
    <div>
      <H2>System Admin</H2>
      <P>
        Admin panel (<code className="font-mono text-xs bg-muted px-1 rounded">/admin</code>) is accessible to users with{" "}
        <Badge variant="warn">admin</Badge> or <Badge variant="warn">super</Badge> role.
        Contains 6 tabs: Operators, Audit Log, Warehouse, Data Import, Backups, Price Sync.
      </P>

      <ImagePlaceholder id="IMG_ADMIN_OVERVIEW" caption="Admin panel — 6 tabs across top navigation" />

      {/* ── Tab 1: Operators ── */}
      <H3>Tab 1 — Operators (User Management)</H3>
      <P>Manage all user accounts in the system. Three roles available:</P>
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center gap-3 text-xs">
          <Badge variant="warn">super</Badge>
          <span className="text-muted-foreground">Full access — user management, API keys, all admin features</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Badge variant="warn">admin</Badge>
          <span className="text-muted-foreground">Full operational access — items, PCBs, products, projects, admin panel</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Badge>user</Badge>
          <span className="text-muted-foreground">Read-only — can view everything but cannot create or edit</span>
        </div>
      </div>
      <P>Actions per user:</P>
      <UL>
        <LI><strong>Add User</strong> — set username, password, role</LI>
        <LI><strong>Edit</strong> — change role or reset password (cannot change username)</LI>
        <LI><strong>Delete</strong> — remove user (cannot delete your own account)</LI>
      </UL>
      <Note type="warn">
        Only <Badge variant="warn">super</Badge> users can create other super users. Admin can create admin/user accounts.
      </Note>

      {/* ── Tab 2: Audit Log ── */}
      <H3>Tab 2 — Audit Log (Change History)</H3>
      <P>
        Complete audit trail of all changes made in the system — who changed what, when.
        Every create/update/delete on items, products, sets, projects, and system settings is logged.
      </P>
      <P>Filter controls:</P>
      <UL>
        <LI><strong>Search</strong> — free-text search across log entries</LI>
        <LI><strong>Entity filter</strong> — filter by entity type: item, product, set, project, user, system, document</LI>
        <LI><strong>Date range</strong> — from / to date picker</LI>
        <LI><strong>Pagination</strong> — 100 records per page, navigate with Prev/Next</LI>
      </UL>
      <Note type="tip">
        Use Audit Log to investigate unexpected changes — filter by entity type and date range to narrow down when a specific item was modified and by whom.
      </Note>

      {/* ── Tab 3: Warehouse ── */}
      <H3>Tab 3 — Warehouse (Physical Inventory)</H3>
      <P>
        Sync physical stock counts and storage locations with the digital BOM database.
        This is separate from the <em>system stock</em> (calculated from BOM usage) —
        warehouse data represents what is physically in storage.
      </P>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 pr-4 font-semibold text-muted-foreground">Column</th>
              <th className="text-left py-1.5 font-semibold text-muted-foreground">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            <tr><td className="py-1.5 pr-4 font-medium">Resource ID</td><td className="py-1.5 text-muted-foreground">Stable ID — permanent identifier for this component</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Component Identity</td><td className="py-1.5 text-muted-foreground">MPN + Manufacturer display</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">System Stock</td><td className="py-1.5 text-muted-foreground">Quantity tracked in the digital BOM system</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Warehouse Inventory</td><td className="py-1.5 text-muted-foreground">Physical count in storage — editable</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Logical Area</td><td className="py-1.5 text-muted-foreground">Storage location (bin/shelf/cabinet label) — editable</td></tr>
            <tr><td className="py-1.5 pr-4 font-medium">Operations</td><td className="py-1.5 text-muted-foreground">Edit / Save inline</td></tr>
          </tbody>
        </table>
      </div>
      <Note type="tip">
        Click the edit icon on a row to update Warehouse Inventory qty and Logical Area. Changes are saved per-row — other rows are not affected.
      </Note>

      {/* ── Tab 4: Data Import ── */}
      <H3>Tab 4 — Data Import</H3>
      <P>
        Import items, PCBs, Products, and BOM data from an Excel backup file.
        Supports standard backup format (exported from Backups tab) and legacy format (UniqueItems / ItemUsage sheets).
      </P>
      <StepList steps={[
        { label: "Open Admin → Data Import tab" },
        { label: "Upload .xlsx file", desc: "drag-and-drop or click to browse — triggers dry run automatically" },
        { label: "Review preflight analysis", desc: "shows how many items/products/BOMs will be created or updated (upsert)" },
        { label: "Toggle Auto-Enrich (optional)", desc: "if enabled, fetches live prices from suppliers for every imported item after injection" },
        { label: "Click Confirm Injection", desc: "commits data to database" },
        { label: "Verification step", desc: "integrity check runs automatically — orphaned references, missing prices reported" },
        { label: "Done", desc: "summary shown: total upserted, created, updated counts" },
      ]} />
      <P>Two accepted file formats: <strong>Standard Backup</strong> (sheet: <code className="font-mono text-xs bg-muted px-1 rounded">Items</code>) exported from this app, and <strong>Legacy Format</strong> (sheets: <code className="font-mono text-xs bg-muted px-1 rounded">UniqueItems</code> + <code className="font-mono text-xs bg-muted px-1 rounded">ItemUsage</code>) from the old app.</P>
      <Note type="warn">
        Auto-Enrich hits supplier APIs (LCSC/Mouser/DigiKey) for every imported item. For imports of 500+ items, leave Auto-Enrich <strong>off</strong> and run <strong>Price Sync</strong> separately after import — avoids Mouser rate limit exhaustion.
      </Note>
      <Note type="info">
        Backend handles <code className="font-mono text-xs bg-muted px-1 rounded">cleanPN()</code> automatically — strips LCSC C-code prefixes and corrects common MPN formats before saving.
      </Note>

      {/* ── Tab 5: Backups ── */}
      <H3>Tab 5 — Backups</H3>
      <P>Export all system data as a portable .xlsx file for offline analysis or disaster recovery.</P>
      <div className="space-y-2 mb-4">
        <div className="rounded-lg border border-border px-3 py-2">
          <p className="text-xs font-semibold">Manual Backup</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click <strong>Download Complete Backup</strong> — generates and downloads an Excel file immediately.
            Filename: <code className="font-mono bg-muted px-1 rounded text-[10px]">bom_backup_YYYY-MM-DD.xlsx</code>.
          </p>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <p className="text-xs font-semibold">Auto Backup</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Toggle on/off. Set interval in minutes (default 30). Runs server-side on a schedule.
            Files are listed in the Auto Backup History table — click download icon to retrieve any past backup.
          </p>
        </div>
      </div>
      <Note type="tip">
        Always download a manual backup before running Data Import. If import causes data issues, you can restore from the backup by importing the downloaded file.
      </Note>

      {/* ── Tab 6: Price Sync ── */}
      <H3>Tab 6 — Price Sync</H3>
      <P>
        Fetches latest prices from LCSC, Mouser, and DigiKey for all items in the database,
        then automatically recalculates Est. Cost for all PCBs, Products, and Projects.
      </P>
      <StepList steps={[
        { label: "Open Admin → Price Sync tab" },
        { label: "Choose sync mode", desc: "\"Missing only\" — items with no price yet (faster); \"All\" — refresh every item (thorough)" },
        { label: "Click Start Sync", desc: "job runs in background with live progress" },
        { label: "Monitor progress", desc: "progress bar shows done/total, updated count, failed count, elapsed time, ETA" },
        { label: "Wait for completion", desc: "Est. Cost recalculates automatically for all entities when sync finishes" },
      ]} />
      <ImagePlaceholder id="IMG_ADMIN_PRICESYNC" caption="Price Sync tab — mode selector, Start Sync button, live progress bar" />
      <P>Progress bar stats explained:</P>
      <UL>
        <LI><strong>Done / Total</strong> — items processed so far vs. total queued</LI>
        <LI><strong>Updated</strong> — items where price/data actually changed</LI>
        <LI><strong>Failed</strong> — items where all suppliers returned no data (normal for custom/internal parts)</LI>
        <LI><strong>Elapsed / ETA</strong> — time running and estimated time to completion</LI>
      </UL>
      <Note type="info">
        Supplier lookup priority per item: LCSC C-code → Mouser → DigiKey. If LCSC returns a result, Mouser/DigiKey are skipped — conserves API quota.
        Failed items are not errors — supplier may simply not carry that part.
      </Note>
      <Note type="warn">
        Mouser free tier: ~1,000 requests/day. DigiKey has generous limits. For large inventories (500+ items), run &quot;Missing only&quot; first, then &quot;All&quot; only when needed to stay within daily limits.
      </Note>
    </div>
  );
}

function ApiKeysSection() {
  return (
    <div>
      <H2>API Keys — Supplier Credentials</H2>
      <P>
        API Keys page (<code className="font-mono text-xs bg-muted px-1 rounded">/configure</code>) manages supplier API credentials
        used by Price Sync to fetch live prices. Accessible to <Badge variant="warn">super</Badge> role only.
      </P>

      <ImagePlaceholder id="IMG_APIKEYS_PAGE" caption="API Keys page — three credential rows (Mouser, DigiKey ID, DigiKey Secret) with source badges" />

      <H3>Supported Suppliers &amp; Credentials</H3>
      <div className="space-y-2 mb-4">
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-black text-foreground">LCSC / JLC</span>
            <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">No API key needed</span>
          </div>
          <p className="text-muted-foreground/70">
            Uses a built-in JLC sidecar service. Configured server-side via{" "}
            <code className="font-mono bg-muted px-1 rounded text-[10px]">JLC_APP_ID</code> and{" "}
            <code className="font-mono bg-muted px-1 rounded text-[10px]">JLC_SECRET_KEY</code> in the server <code className="font-mono bg-muted px-1 rounded text-[10px]">.env</code>.
            No action needed from this page.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-black text-foreground">Mouser</span>
            <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">Single API Key</span>
          </div>
          <p className="text-muted-foreground/70">
            One key field. Free tier: ~1,000 requests/day. Get key from Mouser API Hub (mouser.com/api-hub).
            Rate limit resets daily — if exhausted, LCSC/DigiKey still work for items with those supplier PNs.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-black text-foreground">DigiKey</span>
            <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">Client ID + Client Secret</span>
          </div>
          <p className="text-muted-foreground/70">
            Two fields: Client ID and Client Secret. Uses OAuth2 — access token is auto-refreshed by the backend.
            Get credentials from DigiKey Developer Portal (developer.digikey.com).
            Also enriches component specs (voltage, tolerance, etc.) into the Specs field of each item.
          </p>
        </div>
      </div>

      <H3>Source Indicator</H3>
      <P>Each key row shows a source badge — where the current value came from:</P>
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center gap-3 text-xs">
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded border font-black uppercase tracking-wide bg-green-500/10 text-green-500 border-green-500/20">DB</span>
          <span className="text-muted-foreground">Key was set via this UI — stored encrypted in the database. <strong>Overrides .env value.</strong></span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded border font-black uppercase tracking-wide bg-muted text-muted-foreground border-border">ENV</span>
          <span className="text-muted-foreground">Key loaded from server <code className="font-mono bg-muted px-1 rounded text-[10px]">.env</code> file — no DB override set.</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded border font-black uppercase tracking-wide bg-destructive/10 text-destructive border-destructive/20">missing</span>
          <span className="text-muted-foreground">Key not configured in either DB or .env — Price Sync will skip this supplier.</span>
        </div>
      </div>

      <H3>Updating Keys</H3>
      <StepList steps={[
        { label: "Open Configure → API Keys", desc: "sidebar: Configure section → API Keys" },
        { label: "Click \"Edit Keys\" button", desc: "top-right — opens update modal" },
        { label: "Enter new key values", desc: "leave any field blank to keep its existing value unchanged" },
        { label: "Enter your account password", desc: "required to confirm identity before saving — prevents unauthorized key changes" },
        { label: "Click Save Keys", desc: "takes effect immediately — no server restart required. DigiKey token cache clears automatically." },
      ]} />

      <Note type="tip">
        DB values always override <code className="font-mono text-xs bg-muted px-1 rounded">.env</code> values.
        If you set a key via the UI and later want to revert to .env, you need to clear the DB value — contact your system administrator.
      </Note>
      <Note type="warn">
        If Mouser shows <strong>missing</strong> badge, Price Sync will skip Mouser for all items. Items that only have Mouser PNs will not get updated prices. Always ensure at least one supplier key is active.
      </Note>
    </div>
  );
}

const SECTION_CONTENT: Record<string, React.ReactNode> = {
  overview:  <OverviewSection />,
  items:     <ItemsSection />,
  pcb:       <PCBSection />,
  products:  <ProductsSection />,
  projects:  <ProjectsSection />,
  analytics: <AnalyticsSection />,
  admin:     <AdminSection />,
  apikeys:   <ApiKeysSection />,
};

function HelpPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const rawSection = params.get("section") ?? "overview";
  const active = SECTIONS.some(s => s.id === rawSection) ? rawSection : "overview";
  const section = SECTIONS.find(s => s.id === active)!;
  const [printing, setPrinting] = useState(false);

  function navigate(id: string) {
    router.replace(`/help?section=${id}`, { scroll: false });
  }

  function handlePrint() {
    setPrinting(true);
    // give React one frame to render all sections before browser opens print dialog
    setTimeout(() => {
      window.addEventListener("afterprint", () => setPrinting(false), { once: true });
      window.print();
    }, 80);
  }

  return (
    <div className="flex h-full gap-0 text-foreground">
      {/* Inject print isolation styles when printing — bypasses dashboard layout overflow/height constraints */}
      {printing && (
        <style>{`
          @media print {
            body { position: relative !important; }
            body > * { visibility: hidden !important; }
            #help-print-area, #help-print-area * { visibility: visible !important; }
            #help-print-area {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              padding: 24px 32px !important;
            }
            .help-section-break { page-break-after: always; break-after: page; }
          }
        `}</style>
      )}

      {/* Sidebar TOC — desktop only */}
      <aside className="hidden md:flex w-52 shrink-0 border-r border-border flex-col gap-0.5 py-3 px-2 overflow-y-auto">
        <div className="flex items-center gap-2 px-2 mb-3">
          <BookOpen size={14} className="text-primary" />
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">User Manual</span>
        </div>
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const isActive = s.id === active;
          return (
            <button
              key={s.id}
              onClick={() => navigate(s.id)}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors w-full",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon size={13} className="shrink-0" />
              <span className="text-xs font-semibold">{s.label}</span>
            </button>
          );
        })}
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 md:px-10 py-6">
        {/* Mobile section picker */}
        <div className="md:hidden mb-4">
          <Select value={active} onValueChange={navigate}>
            <SelectTrigger className="w-full h-10 text-sm font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SECTIONS.map(s => (
                <SelectItem key={s.id} value={s.id} className="text-sm">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
          <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center shrink-0", section.color)}>
            <section.icon size={18} />
          </div>
          <div className="flex-1 flex items-center justify-between gap-4">
            <h1 className="text-xl font-black tracking-tight">{section.label}</h1>
            <button
              onClick={handlePrint}
              title="Export full manual as PDF"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all",
                "border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/60",
                "active:scale-95"
              )}
            >
              <Printer size={12} />
              Export PDF
            </button>
          </div>
        </div>

        {SECTION_CONTENT[active]}
      </main>

      {/* Print area — rendered outside layout constraints, only visible to printer */}
      {printing && (
        <div id="help-print-area" aria-hidden="true">
          <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: "2px solid #e5e7eb" }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>IOTBomlist — User Manual</h1>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Complete reference guide</p>
          </div>
          {SECTIONS.map((s, i) => (
            <div key={s.id} className={i < SECTIONS.length - 1 ? "help-section-break" : ""}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{s.label}</h2>
              </div>
              {SECTION_CONTENT[s.id]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense>
      <HelpPageInner />
    </Suspense>
  );
}

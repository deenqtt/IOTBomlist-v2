import {
  Cpu,
  Package,
  Layers,
  FolderTree,
  ShieldCheck,
  BarChart3,
  KeyRound,
} from "lucide-react";
import type { ElementType } from "react";

export type NavRole = "all" | "admin" | "super";

export type NavItemConfig = {
  href: string;
  label: string;
  icon: ElementType;
  role?: NavRole;
  shortcut?: string;
};

export type NavSectionConfig = {
  id: string;
  label: string;
  role?: NavRole;
  defaultCollapsed?: boolean;
  items: NavItemConfig[];
};

export const NAV_CONFIG: NavSectionConfig[] = [
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/items", label: "Items", icon: Cpu, shortcut: "G I" },
      { href: "/products", label: "PCB", icon: Package, shortcut: "G P" },
      { href: "/sets", label: "Products", icon: Layers, shortcut: "G S" },
      {
        href: "/projects",
        label: "Projects",
        icon: FolderTree,
        shortcut: "G U",
      },
    ],
  },
  {
    id: "planning",
    label: "Planning",
    items: [
      {
        href: "/analytics",
        label: "Analytics",
        icon: BarChart3,
        role: "admin",
      },
    ],
  },
  {
    id: "configure",
    label: "Configure",
    role: "admin",
    defaultCollapsed: true,
    items: [
      { href: "/admin", label: "System Control", icon: ShieldCheck },
      { href: "/configure", label: "API Keys", icon: KeyRound, role: "super" as NavRole },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItemConfig[] = NAV_CONFIG.flatMap(
  (s) => s.items,
);

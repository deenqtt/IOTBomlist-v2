"use client";

import React, { useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isAdmin, isSuper, getToken } from "@/lib/auth";
import {
  useAdminUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useChangeLog,
  useWarehouse,
  useUpdateWarehouse,
  downloadBackup,
  useAdminSettings,
  useUpdateAdminSettings,
  useAutoBackups,
  downloadAutoBackup,
} from "@/hooks/useAdmin";
import { useDebounce } from "@/hooks/useDebounce";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Users,
  ScrollText,
  Warehouse,
  Upload,
  Download,
  Pencil,
  Trash2,
  Cpu,
  Check,
  FolderTree,
  X,
  RefreshCw,
  Search,
  ShieldCheck,
  Activity,
  Database,
  History,
  HardDrive,
  Fingerprint,
  Lock,
  UserPlus,
  Key,
  ArrowDown,
  ArrowUp,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Box,
  MapPin,
  Info,
  Zap,
  GitBranch,
  Layers,
  Package,
  Rows3,
  DollarSign,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/MetricCard";

type Tab = "users" | "changelog" | "warehouse" | "import" | "backup";

// ─── Role Badge ─────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const styles: Record<
    string,
    { bg: string; text: string; border: string; icon: React.ElementType }
  > = {
    super: {
      bg: "bg-purple-500/10",
      text: "text-purple-600 dark:text-purple-400",
      border: "border-purple-500/20",
      icon: ShieldCheck,
    },
    admin: {
      bg: "bg-blue-500/10",
      text: "text-blue-600 dark:text-blue-400",
      border: "border-blue-500/20",
      icon: Fingerprint,
    },
    user: {
      bg: "bg-slate-500/10",
      text: "text-slate-600 dark:text-slate-400",
      border: "border-slate-500/20",
      icon: Users,
    },
  };
  const s = styles[role] ?? styles.user;
  const Icon = s.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider shadow-sm",
        s.bg,
        s.text,
        s.border,
      )}
    >
      <Icon size={10} strokeWidth={3} />
      {role}
    </span>
  );
}

// ─── Users Tab ─────────────────────────────────────────────────────────────

function UsersTab({ currentUserId }: { currentUserId?: number }) {
  const { data: users, isLoading, refetch } = useAdminUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "user",
  });
  const [formError, setFormError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState({ role: "", password: "" });
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    username: string;
  } | null>(null);

  async function handleCreate() {
    if (!form.username.trim() || !form.password) {
      setFormError("Username & password wajib diisi");
      return;
    }
    setFormError("");
    try {
      await createUser.mutateAsync(form);
      setForm({ username: "", password: "", role: "user" });
      setShowCreate(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setFormError(err?.response?.data?.error ?? "Gagal membuat user");
    }
  }

  async function handleUpdate() {
    if (!editId) return;
    const data: { role?: string; passwordHash?: string } = {};
    if (editData.role) data.role = editData.role;
    if (editData.password) data.passwordHash = editData.password;
    await updateUser.mutateAsync({ id: editId, ...data });
    setEditId(null);
    setEditData({ role: "", password: "" });
  }

  return (
    <div className="flex flex-col gap-6 text-foreground">
      <div className="flex items-center justify-between text-foreground">
        <div>
          <h2 className="text-lg font-black tracking-tight">User Directory</h2>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest opacity-60">
            {users?.length ?? 0} active accounts in system
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="h-10 w-10 flex items-center justify-center rounded-xl border border-border bg-card shadow-sm hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => {
              setShowCreate((v) => !v);
              setFormError("");
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm",
              showCreate
                ? "bg-muted text-foreground"
                : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            {showCreate ? <X size={14} /> : <UserPlus size={14} />}
            {showCreate ? "Cancel" : "Add User"}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="border border-border rounded-2xl p-6 bg-primary/[0.02] flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <UserPlus size={16} />
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground">
              Create New Operator
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5 text-foreground">
              <Label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">
                Username
              </Label>
              <input
                placeholder="e.g. jhon_doe"
                value={form.username}
                onChange={(e) =>
                  setForm((p) => ({ ...p, username: e.target.value }))
                }
                className="w-full px-4 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm text-foreground"
              />
            </div>
            <div className="space-y-1.5 text-foreground">
              <Label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">
                Temporary Password
              </Label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) =>
                  setForm((p) => ({ ...p, password: e.target.value }))
                }
                className="w-full px-4 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm text-foreground"
              />
            </div>
            <div className="space-y-1.5 text-foreground">
              <Label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">
                System Role
              </Label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm((p) => ({ ...p, role: e.target.value }))
                }
                className="w-full px-4 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm transition-all text-foreground"
              >
                <option value="user">Standard User</option>
                <option value="admin">Administrator</option>
                <option value="super">System Superuser</option>
              </select>
            </div>
          </div>

          {formError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs font-bold border border-destructive/20">
              <AlertCircle size={14} /> {formError}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2 text-foreground">
            <button
              onClick={handleCreate}
              disabled={createUser.isPending}
              className="px-6 py-2 text-xs font-black uppercase tracking-wider bg-primary text-primary-foreground rounded-xl hover:opacity-90 disabled:opacity-50 shadow-md transition-all active:scale-95 text-primary-foreground"
            >
              {createUser.isPending ? "Syncing..." : "Confirm Deployment"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border overflow-hidden bg-card shadow-sm text-foreground text-foreground text-foreground">
        <table className="w-full text-sm border-collapse text-foreground text-foreground text-foreground">
          <thead className="bg-muted/30 text-foreground text-foreground">
            <tr className="text-foreground">
              {[
                "Identity",
                "Role Permissions",
                "Deployment Date",
                "Control Hub",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="text-center py-20 text-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw
                      size={24}
                      className="animate-spin text-primary/40"
                    />
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
                      Initializing Directory...
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              users?.map((u, i) => (
                <tr
                  key={u.id}
                  className={cn(
                    "border-b border-border transition-all duration-100 group/row",
                    i % 2 !== 0 ? "bg-muted/[0.02]" : "",
                    "hover:bg-primary/[0.01]",
                  )}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center border border-border group-hover/row:border-primary/20 group-hover/row:bg-primary/5 transition-colors">
                        <Users
                          size={16}
                          className="text-muted-foreground group-hover/row:text-primary transition-colors text-muted-foreground"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-sm text-foreground leading-tight tracking-tight">
                          {u.username}
                        </p>
                        {u.id === currentUserId && (
                          <Badge
                            variant="outline"
                            className="h-3 text-[7px] font-black uppercase px-1 py-0 bg-primary/5 border-primary/20 text-primary mt-1"
                          >
                            Self
                          </Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {editId === u.id ? (
                      <select
                        value={editData.role || u.role}
                        onChange={(e) =>
                          setEditData((p) => ({ ...p, role: e.target.value }))
                        }
                        className="text-xs font-bold px-3 py-1.5 border border-border rounded-lg bg-background shadow-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                      >
                        <option value="user">Standard User</option>
                        <option value="admin">Administrator</option>
                        <option value="super">System Superuser</option>
                      </select>
                    ) : (
                      <RoleBadge role={u.role} />
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Activity size={10} className="opacity-40" />
                      <span className="text-[11px] font-bold tabular-nums text-foreground">
                        {new Date(u.createdAt).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {editId === u.id ? (
                      <div className="flex items-center gap-2">
                        <div className="relative group/input text-foreground">
                          <Key
                            size={12}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within/input:text-primary transition-colors text-muted-foreground text-muted-foreground"
                          />
                          <input
                            type="password"
                            placeholder="New credentials..."
                            value={editData.password}
                            onChange={(e) =>
                              setEditData((p) => ({
                                ...p,
                                password: e.target.value,
                              }))
                            }
                            className="text-xs font-bold pl-8 pr-3 py-1.5 border border-border rounded-lg bg-background w-48 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground text-foreground"
                          />
                        </div>
                        <button
                          onClick={handleUpdate}
                          className="h-8 w-8 flex items-center justify-center rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500 hover:text-white transition-all shadow-sm"
                          title="Commit Changes"
                        >
                          <Check size={14} strokeWidth={3} />
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-slate-200 transition-all text-muted-foreground"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-foreground">
                        <button
                          onClick={() => {
                            setEditId(u.id);
                            setEditData({ role: u.role, password: "" });
                          }}
                          className="h-9 px-3 flex items-center gap-2 rounded-xl border border-border bg-card text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all shadow-sm"
                        >
                          <Pencil size={12} /> Edit Control
                        </button>
                        {u.id !== currentUserId && (
                          <button
                            onClick={() =>
                              setDeleteTarget({
                                id: u.id,
                                username: u.username,
                              })
                            }
                            className="h-9 w-9 flex items-center justify-center rounded-xl bg-destructive/5 text-muted-foreground hover:bg-destructive hover:text-white transition-all shadow-sm text-muted-foreground"
                            title="Deactivate Operator"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Authorize Deactivation?`}
        description={`Operator "${deleteTarget?.username}" will be permanently revoked from system access.`}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteUser.mutateAsync(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteUser.isPending}
      />
    </div>
  );
}

// ─── Change Log Tab ────────────────────────────────────────────────────────

function ChangeLogTab() {
  const [entity, setEntity] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 100;
  const dQ = useDebounce(q, 300);

  const { data, isLoading, isFetching } = useChangeLog({
    entity: entity || undefined,
    q: dQ || undefined,
    from: from || undefined,
    to: to || undefined,
    skip,
    limit,
  });

  const entities = [
    "item",
    "product",
    "set",
    "project",
    "user",
    "system",
    "document",
  ];

  return (
    <div className="flex flex-col gap-6 text-foreground">
      {/* Smart Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/20 p-4 rounded-2xl border border-border/50 shadow-inner">
        <div className="relative group/search text-foreground">
          <Search
            size={12}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within/search:text-primary transition-colors text-muted-foreground text-muted-foreground"
          />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSkip(0);
            }}
            placeholder="Search log history..."
            className="pl-9 pr-3 py-2 text-xs font-bold border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 w-48 shadow-sm transition-all text-foreground"
          />
        </div>

        <div className="w-px h-6 bg-border mx-1 hidden md:block" />

        <div className="flex items-center gap-2 text-foreground">
          <Label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1 text-muted-foreground">
            Entity
          </Label>
          <select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setSkip(0);
            }}
            className="px-3 py-2 text-[10px] font-black uppercase border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm transition-all text-foreground"
          >
            <option value="">All Streams</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-foreground">
          <Label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1 text-muted-foreground">
            Timeline
          </Label>
          <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2 py-1 shadow-sm">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setSkip(0);
              }}
              className="bg-transparent text-[10px] font-bold focus:outline-none text-foreground"
            />
            <span className="text-muted-foreground opacity-30">—</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setSkip(0);
              }}
              className="bg-transparent text-[10px] font-bold focus:outline-none text-foreground text-foreground"
            />
          </div>
        </div>

        {(entity || q || from || to) && (
          <button
            onClick={() => {
              setEntity("");
              setQ("");
              setFrom("");
              setTo("");
              setSkip(0);
            }}
            className="px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-muted text-muted-foreground border border-border rounded-xl hover:bg-slate-200 transition-all active:scale-95 text-muted-foreground"
          >
            Reset Intelligence
          </button>
        )}
        {isFetching && (
          <RefreshCw
            size={14}
            className="animate-spin text-primary/60 ml-auto"
          />
        )}
      </div>

      {/* Audit List */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden text-foreground">
        <div className="overflow-x-auto text-foreground">
          <table className="w-full text-sm border-collapse text-foreground">
            <thead className="bg-muted/30 text-foreground">
              <tr className="text-foreground">
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border text-center w-12 text-muted-foreground text-muted-foreground">
                  Type
                </th>
                {[
                  "Chronology",
                  "Resource Hub",
                  "Field Impact",
                  "Visual Delta",
                  "Operator",
                  "Intelligence Context",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-20 text-muted-foreground font-bold uppercase tracking-widest opacity-40 text-muted-foreground"
                  >
                    Decrypting Audit Stream...
                  </td>
                </tr>
              ) : !data?.data.length ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-20 text-muted-foreground font-bold uppercase tracking-widest opacity-40 text-muted-foreground"
                  >
                    Intelligence Stream Empty
                  </td>
                </tr>
              ) : (
                data.data.map((row, i) => {
                  const isDelete =
                    row.context?.toLowerCase().includes("delete") ||
                    row.newValue === null;
                  const isAdd =
                    row.oldValue === null ||
                    row.context?.toLowerCase().includes("create");

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border/60 transition-all duration-100 group/row",
                        i % 2 !== 0 ? "bg-muted/[0.01]" : "",
                        "hover:bg-primary/[0.01]",
                      )}
                    >
                      <td className="px-4 py-4 text-center text-foreground text-foreground">
                        <div
                          className={cn(
                            "w-1.5 h-6 rounded-full mx-auto shadow-sm",
                            isDelete
                              ? "bg-destructive/60 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
                              : isAdd
                                ? "bg-green-500/60 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                                : "bg-blue-500/60 shadow-[0_0_8px_rgba(59,130,246,0.3)]",
                          )}
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-foreground text-foreground">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-black tabular-nums text-foreground">
                            {new Date(row.changedAt).toLocaleTimeString(
                              "id-ID",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </span>
                          <span className="text-[9px] font-bold text-muted-foreground opacity-60 text-muted-foreground text-muted-foreground">
                            {new Date(row.changedAt).toLocaleDateString(
                              "id-ID",
                              { day: "2-digit", month: "short" },
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-foreground">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[9px] font-black uppercase px-1.5 py-0 border-primary/20 text-primary bg-primary/5"
                          >
                            {row.entity === "product"
                              ? "pcb"
                              : row.entity === "set"
                                ? "product"
                                : row.entity}
                          </Badge>
                          <span className="font-mono text-[10px] font-bold text-muted-foreground/70 text-muted-foreground">
                            {row.entityId}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-foreground text-foreground">
                        <span className="text-[10px] font-black uppercase tracking-tighter text-foreground">
                          {row.field ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-foreground text-foreground">
                        <div className="flex flex-col gap-1 text-[10px] font-bold text-foreground">
                          {row.oldValue ? (
                            <div className="flex items-center gap-1.5 text-destructive/80 line-through opacity-50 italic">
                              <ArrowDown size={10} />
                              <span className="max-w-[120px] truncate text-destructive text-destructive">
                                {row.oldValue}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                          {row.newValue ? (
                            <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
                              <ArrowUp size={10} />
                              <span className="max-w-[120px] truncate">
                                {row.newValue}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30 text-muted-foreground">
                              —
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-foreground">
                        <div className="flex items-center gap-2 text-foreground">
                          <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center border border-border shadow-inner">
                            <Fingerprint
                              size={12}
                              className="text-muted-foreground text-muted-foreground"
                            />
                          </div>
                          <span className="text-[11px] font-black text-foreground">
                            {row.changedBy ?? "SYSTEM"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-foreground text-foreground text-foreground">
                        <p
                          className="text-[10px] font-medium text-muted-foreground line-clamp-1 max-w-[200px] text-muted-foreground text-muted-foreground"
                          title={row.context ?? ""}
                        >
                          {row.context ?? "No metadata"}
                        </p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.total > limit && (
        <div className="flex items-center justify-between px-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-muted-foreground">
          <div className="flex items-center gap-2 text-foreground">
            <button
              disabled={skip === 0}
              onClick={() => setSkip((s) => Math.max(0, s - limit))}
              className="h-8 px-4 border border-border rounded-xl hover:bg-accent disabled:opacity-40 transition-all active:scale-95 shadow-sm text-foreground text-foreground"
            >
              ← Prev
            </button>
            <button
              disabled={skip + limit >= data.total}
              onClick={() => setSkip((s) => s + limit)}
              className="h-8 px-4 border border-border rounded-xl hover:bg-accent disabled:opacity-40 transition-all active:scale-95 shadow-sm text-foreground text-foreground"
            >
              Next →
            </button>
          </div>
          <div className="flex items-center gap-2 text-foreground">
            <span className="opacity-40 text-muted-foreground text-muted-foreground text-muted-foreground">
              Intelligence Window:
            </span>
            <span className="text-foreground text-foreground text-foreground text-foreground">
              {skip + 1}–{Math.min(skip + limit, data.total)} /{" "}
              {data.total.toLocaleString()} records
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Warehouse Tab ─────────────────────────────────────────────────────────

function WarehouseTab() {
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 100;
  const dQ = useDebounce(q, 300);

  const { data, isLoading, isFetching } = useWarehouse({
    q: dQ || undefined,
    skip,
    limit,
  });
  const updateWH = useUpdateWarehouse();

  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ whQty: "", whLocation: "" });

  async function handleSave(stableId: string) {
    await updateWH.mutateAsync({
      stableId,
      whQty: editData.whQty !== "" ? Number(editData.whQty) : null,
      whLocation: editData.whLocation || null,
    });
    setEditId(null);
  }

  return (
    <div className="flex flex-col gap-6 text-foreground">
      <div className="flex items-center justify-between flex-wrap gap-4 text-foreground">
        <div className="text-foreground">
          <h2 className="text-lg font-black tracking-tight text-foreground text-foreground text-foreground">
            Warehouse Intelligence
          </h2>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest opacity-60 text-muted-foreground">
            Synchronizing physical inventory with digital BOM
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group/search text-foreground text-foreground">
            <Search
              size={12}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within/search:text-primary transition-colors text-muted-foreground text-muted-foreground"
            />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSkip(0);
              }}
              placeholder="Search resources..."
              className="pl-9 pr-3 py-2 text-xs font-bold border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 w-64 shadow-sm transition-all text-foreground"
            />
          </div>
          {isFetching && (
            <RefreshCw
              size={14}
              className="animate-spin text-primary/60 text-primary"
            />
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden text-foreground text-foreground text-foreground">
        <div className="overflow-x-auto text-foreground">
          <table className="w-full text-sm border-collapse text-foreground text-foreground text-foreground text-foreground">
            <thead className="bg-muted/30 text-foreground">
              <tr className="text-foreground">
                {[
                  "Resource ID",
                  "Component Identity",
                  "System Stock",
                  "Warehouse Inventory",
                  "Logical Area",
                  "Operations",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-20 text-muted-foreground font-bold uppercase tracking-widest opacity-40 text-muted-foreground text-muted-foreground text-muted-foreground"
                  >
                    Initializing Inventory Stream...
                  </td>
                </tr>
              ) : !data?.data.length ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-20 text-muted-foreground font-bold uppercase tracking-widest opacity-40 text-muted-foreground text-muted-foreground text-muted-foreground text-muted-foreground"
                  >
                    No resources detected
                  </td>
                </tr>
              ) : (
                data.data.map((item, i) => {
                  const delta = (item.whQty ?? 0) - (item.stockQty ?? 0);
                  return (
                    <tr
                      key={item.stableId}
                      className={cn(
                        "border-b border-border transition-all duration-100 group/row text-foreground",
                        i % 2 !== 0 ? "bg-muted/[0.01]" : "",
                        "hover:bg-primary/[0.01]",
                      )}
                    >
                      <td className="px-6 py-4 font-mono text-[10px] font-black text-primary/70 text-primary">
                        {item.stableId}
                      </td>
                      <td className="px-6 py-4 text-foreground">
                        <div className="flex flex-col gap-0.5 text-foreground">
                          <span className="font-bold text-xs text-foreground">
                            {item.partNumber ?? "—"}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[200px] text-muted-foreground">
                            {item.productName ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-foreground">
                          <Box
                            size={10}
                            className="text-muted-foreground opacity-40 text-muted-foreground"
                          />
                          <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                            {item.stockQty ?? 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-foreground">
                        {editId === item.stableId ? (
                          <input
                            type="number"
                            value={editData.whQty}
                            onChange={(e) =>
                              setEditData((p) => ({
                                ...p,
                                whQty: e.target.value,
                              }))
                            }
                            className="w-24 px-3 py-1.5 text-xs font-black border border-primary/30 rounded-lg bg-background text-center focus:ring-1 focus:ring-primary outline-none text-foreground text-foreground text-foreground"
                          />
                        ) : (
                          <div className="flex items-center gap-3 text-foreground">
                            <div
                              className={cn(
                                "px-3 py-1 rounded-lg font-mono text-xs font-black tabular-nums border shadow-sm",
                                item.whQty != null
                                  ? "bg-card border-border text-foreground"
                                  : "bg-muted/50 border-transparent text-muted-foreground opacity-40",
                              )}
                            >
                              {item.whQty ?? "???"}
                            </div>
                            {item.whQty != null && delta !== 0 && (
                              <Badge
                                className={cn(
                                  "h-4 px-1.5 text-[8px] font-black border-none shadow-none text-foreground",
                                  delta > 0
                                    ? "bg-green-500/10 text-green-600"
                                    : "bg-destructive/10 text-destructive",
                                )}
                              >
                                {delta > 0 ? "+" : ""}
                                {delta}
                              </Badge>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editId === item.stableId ? (
                          <div className="relative group/input text-foreground text-foreground text-foreground">
                            <MapPin
                              size={10}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground opacity-40 text-muted-foreground text-muted-foreground"
                            />
                            <input
                              value={editData.whLocation}
                              onChange={(e) =>
                                setEditData((p) => ({
                                  ...p,
                                  whLocation: e.target.value,
                                }))
                              }
                              placeholder="Assign Zone..."
                              className="w-32 pl-7 pr-3 py-1.5 text-xs font-bold border border-primary/30 rounded-lg bg-background focus:ring-1 focus:ring-primary outline-none text-foreground text-foreground"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 opacity-70 text-foreground">
                            <MapPin
                              size={10}
                              className="text-muted-foreground text-muted-foreground text-muted-foreground"
                            />
                            <span className="text-[10px] font-black uppercase tracking-wider text-foreground">
                              {item.whLocation ?? "Unassigned"}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-foreground">
                        {editId === item.stableId ? (
                          <div className="flex gap-2 text-foreground">
                            <button
                              onClick={() => handleSave(item.stableId)}
                              className="h-8 w-8 flex items-center justify-center rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500 hover:text-white transition-all shadow-sm text-green-600"
                            >
                              <Check size={14} strokeWidth={3} />
                            </button>
                            <button
                              onClick={() => setEditId(null)}
                              className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-slate-200 transition-all text-muted-foreground text-muted-foreground text-muted-foreground"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditId(item.stableId);
                              setEditData({
                                whQty: String(item.whQty ?? ""),
                                whLocation: item.whLocation ?? "",
                              });
                            }}
                            className="h-9 w-9 flex items-center justify-center rounded-xl border border-border bg-card shadow-sm hover:border-primary/40 text-muted-foreground hover:text-primary transition-all text-muted-foreground text-muted-foreground text-muted-foreground"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.total > limit && (
        <div className="flex items-center justify-between px-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-muted-foreground">
          <div className="flex items-center gap-2 text-foreground text-foreground">
            <button
              disabled={skip === 0}
              onClick={() => setSkip((s) => Math.max(0, s - limit))}
              className="h-8 px-4 border border-border rounded-xl hover:bg-accent disabled:opacity-40 transition-all active:scale-95 shadow-sm text-foreground text-foreground text-foreground"
            >
              ← Prev
            </button>
            <button
              disabled={skip + limit >= data.total}
              onClick={() => setSkip((s) => s + limit)}
              className="h-8 px-4 border border-border rounded-xl hover:bg-accent disabled:opacity-40 transition-all active:scale-95 shadow-sm text-foreground text-foreground text-foreground text-foreground"
            >
              Next →
            </button>
          </div>
          <div className="flex items-center gap-2 text-foreground">
            <span className="opacity-40 text-muted-foreground text-muted-foreground text-muted-foreground text-muted-foreground">
              Intelligence Window:
            </span>
            <span className="text-foreground text-foreground text-foreground text-foreground text-foreground">
              {skip + 1}–{Math.min(skip + limit, data.total)} /{" "}
              {data.total.toLocaleString()} records
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Import Tab ────────────────────────────────────────────────────────────

interface ImportResult {
  dryRun?: boolean;
  itemsImported: number;
  productsImported: number;
  bomRowsImported: number;
  setsImported: number;
  setItemsImported?: number;
  supersetsImported?: number;
  ssItemsImported?: number;
  warnings: string[];
  errors: string[];
  totalErrors: number;
  isValid: boolean;
}

interface IntegrityReport {
  healthScore: number;
  checks: {
    orphanedBOM: boolean;
    completeInventory: boolean;
    populatedPCBs: boolean;
    populatedSets: boolean;
  };
  details: {
    orphanedBOMCount: number;
    emptyPCBsCount: number;
    emptySetsCount: number;
    unpricedItemsCount: number;
  };
}

function ImportTab() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "preflight" | "injecting" | "verification" | "finished" | "enriching">("upload");
  const [analysis, setAnalysis] = useState<ImportResult | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [autoEnrich, setAutoEnrich] = useState(false);
  const [error, setError] = useState("");

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError("");
    await runPreflight(f);
  }

  async function runPreflight(f: File) {
    setStep("preflight");
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await api.post("/admin/import?dryRun=true", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAnalysis(res.data);
    } catch (err: unknown) {
      const errorData = err as { response?: { data?: { error?: string } } };
      setError(errorData.response?.data?.error || "Analysis failed");
      setStep("upload");
    }
  }

  async function handleConfirmInjection() {
    if (!file) return;
    setStep(autoEnrich ? "enriching" : "injecting");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post(`/admin/import?dryRun=false&autoEnrich=${autoEnrich}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30 * 60 * 1000, // 30 min — enrich 800+ items hits LCSC/Mouser/DigiKey
      });
      setAnalysis(res.data);
      await runVerification();
    } catch (err: unknown) {
      const errorData = err as { response?: { data?: { error?: string } } };
      setError(errorData.response?.data?.error || "Injection failed");
      setStep("preflight");
    }
  }

  async function runVerification() {
    setStep("verification");
    try {
      // Small delay for drama and ensuring DB consistency
      await new Promise(r => setTimeout(r, 1500));
      const res = await api.get("/admin/verify-integrity");
      setIntegrity(res.data);

      // Invalidate all costing to force fresh recalculation
      qc.invalidateQueries({ queryKey: ['costing-products'] });
      qc.invalidateQueries({ queryKey: ['costing-sets'] });
      qc.invalidateQueries({ queryKey: ['costing-projects'] });

      setStep("finished");
    } catch {
      setStep("finished"); // Still finish even if report fails
    }
  }

  function reset() {
    setFile(null);
    setStep("upload");
    setAnalysis(null);
    setIntegrity(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-8  text-foreground">
      {/* ── Progress Track ── */}
      <div className="flex items-center gap-2 px-1">
        {[
          { id: "upload", label: "Upload" },
          { id: "preflight", label: "Analysis" },
          { id: "injecting", label: "Injection" },
          { id: "finished", label: "System Health" },
        ].map((s, i) => {
          const active =
            step === s.id || (s.id === "injecting" && step === "verification");
          const done =
            (i === 0 && step !== "upload") ||
            (i === 1 && !["upload", "preflight"].includes(step)) ||
            (i === 2 && step === "finished");

          return (
            <React.Fragment key={s.id}>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all border-2",
                    done
                      ? "bg-green-500 border-green-500 text-white"
                      : active
                        ? "border-primary text-primary shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                        : "border-muted text-muted-foreground opacity-40",
                  )}
                >
                  {done ? <Check size={12} strokeWidth={4} /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-black uppercase tracking-widest",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground opacity-40",
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < 3 && (
                <div
                  className={cn(
                    "flex-1 h-px max-w-[40px] mx-2",
                    done ? "bg-green-500" : "bg-muted",
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                <Zap size={20} className="text-primary fill-primary/20" />
                Smart Data Injection
              </h2>
              <p className="text-xs text-muted-foreground font-medium">
                Our neural analyzer will scan your dataset for relational
                integrity before any changes are committed to the system.
              </p>
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              className="group border-2 border-dashed border-border hover:border-primary/50 rounded-3xl p-12 text-center transition-all cursor-pointer hover:bg-primary/[0.02]"
            >
              <div className="w-20 h-20 rounded-2xl bg-muted group-hover:bg-primary/10 flex items-center justify-center mx-auto mb-6 transition-all group-hover:scale-110">
                <Upload
                  size={36}
                  className="text-muted-foreground group-hover:text-primary transition-colors"
                />
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-foreground">
                Select Master Dataset
              </p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-2">
                .XLSX or .XLS format
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-3 animate-in shake-1 duration-300">
                <AlertCircle size={18} /> {error}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-muted/20 p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center shadow-sm">
                <ShieldCheck size={20} className="text-primary" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-widest">
                Security Protocol
              </h3>
            </div>
            <div className="space-y-4">
              {[
                {
                  title: "Relational Check",
                  desc: "Verifies BOM references against the Master Items sheet.",
                },
                {
                  title: "Atomic Updates",
                  desc: "Uses UPSERT logic to prevent duplicate record conflicts.",
                },
                {
                  title: "Structural Audit",
                  desc: "Ensures Products and ConfigSets have valid compositions.",
                },
              ].map((p) => (
                <div key={p.title} className="space-y-1">
                  <p className="text-[10px] font-black text-primary uppercase tracking-tighter">
                    {p.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {p.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Pre-flight Analysis ── */}
      {step === "preflight" && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-black tracking-tight">
                Pre-flight Intelligence Report
              </h2>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest opacity-60">
                Source: {file?.name}
              </p>
            </div>
            <button
              onClick={reset}
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Cancel & Reset
            </button>
          </div>

          {!analysis ? (
            <div className="p-20 border border-border rounded-3xl bg-muted/10 flex flex-col items-center justify-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <Activity
                  size={24}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary animate-pulse"
                />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-black uppercase tracking-[0.2em]">
                  Analyzing Dataset Structure
                </p>
                <p className="text-xs text-muted-foreground animate-pulse">
                  Scanning relational dependencies across all sheets...
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Column 1: Mappings */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Entity Mapping Check
                    </h3>
                    <Badge
                      variant="outline"
                      className="h-5 text-[9px] font-black uppercase bg-green-500/10 text-green-600 border-green-500/20"
                    >
                      Analyzed
                    </Badge>
                  </div>
                  <div className="p-2 grid grid-cols-2 gap-2">
                    {[
                      {
                        icon: Cpu,
                        label: "Master Items",
                        val: analysis.itemsImported,
                        status: "OK",
                      },
                      {
                        icon: Package,
                        label: "PCB Assemblies",
                        val: analysis.productsImported,
                        status: "OK",
                      },
                      {
                        icon: Rows3,
                        label: "BOM Row Mappings",
                        val: analysis.bomRowsImported,
                        status: "OK",
                      },
                      {
                        icon: Layers,
                        label: "Configured Products",
                        val: analysis.setsImported,
                        status: "OK",
                      },
                      {
                        icon: FolderTree,
                        label: "Active Projects",
                        val: analysis.supersetsImported ?? 0,
                        status: "OK",
                      },
                      {
                        icon: GitBranch,
                        label: "Project Composition",
                        val: analysis.ssItemsImported ?? 0,
                        status: "OK",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between p-4 rounded-2xl bg-muted/10 border border-transparent hover:border-border transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center shadow-sm">
                            <item.icon size={14} className="text-primary/60" />
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground">
                              {item.label}
                            </p>
                            <p className="text-lg font-black tabular-nums leading-none">
                              {item.val}
                            </p>
                          </div>
                        </div>
                        <CheckCircle2 size={16} className="text-green-500" />
                      </div>
                    ))}
                  </div>
                </div>

                {analysis.warnings.length > 0 && (
                  <div className="bg-amber-500/[0.03] border border-amber-500/20 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 shadow-sm">
                        <AlertCircle size={16} />
                      </div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-amber-800">
                        Relational Anomalies Detected
                      </h3>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-auto pr-2 custom-scrollbar">
                      {analysis.warnings.map((w, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-[10px] font-bold text-amber-700/80 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10"
                        >
                          <span className="opacity-40 mt-0.5">•</span>
                          <p>{w}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Column 2: Actions */}
              <div className="space-y-6">
                <div className="bg-primary border border-primary/20 rounded-3xl p-8 text-primary-foreground shadow-xl shadow-primary/20 flex flex-col gap-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:scale-110 transition-transform" />
                  <div className="space-y-2 relative z-10">
                     <h3 className="text-lg font-black leading-tight">Proceed with Injection?</h3>
                     <p className="text-[11px] font-medium opacity-80 leading-relaxed">
                        All data will be processed using UPSERT logic. Existing records will be updated, and new records will be added to the system.
                     </p>
                  </div>

                  <div className="bg-white/10 p-4 rounded-2xl border border-white/10 space-y-3 relative z-10">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                              <Zap size={12} className="text-white" />
                           </div>
                           <span className="text-[10px] font-black uppercase tracking-widest text-white">Auto-Enrich Prices</span>
                        </div>
                        <button 
                          onClick={() => setAutoEnrich(!autoEnrich)}
                          className={cn(
                            "w-10 h-5 rounded-full transition-all relative border-2 border-white/20",
                            autoEnrich ? "bg-white" : "bg-transparent"
                          )}
                        >
                           <div className={cn(
                              "w-3 h-3 rounded-full absolute top-0.5 transition-all",
                              autoEnrich ? "right-0.5 bg-primary" : "left-0.5 bg-white"
                           )} />
                        </button>
                     </div>
                     <p className="text-[9px] font-medium leading-relaxed opacity-70">
                        Search LCSC/Mouser/Digikey for missing prices during import. <span className="font-black italic">May slow down the process.</span>
                     </p>
                  </div>

                  <button 
                     onClick={handleConfirmInjection}
                     className="w-full h-14 rounded-2xl bg-white text-primary font-black uppercase tracking-[0.2em] text-xs shadow-lg hover:scale-[1.02] active:scale-95 transition-all relative z-10"
                  >
                     Confirm & Commit
                  </button>
                  <p className="text-[9px] font-black uppercase tracking-widest text-center opacity-60">System-wide Impact</p>
                  </div>

                <div className="p-6 rounded-3xl border border-border bg-muted/20 flex gap-4">
                  <Info
                    size={16}
                    className="text-muted-foreground shrink-0 mt-0.5"
                  />
                  <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">
                     Neural Analysis ensures that no &quot;orphaned&quot; records are created. If an item is missing in the Master list, the system will warn you.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Injecting & Verification ── */}
      {(step === "injecting" || step === "verification" || step === "enriching") && (
        <div className="p-20 border border-border rounded-[40px] bg-card flex flex-col items-center justify-center gap-10 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent" />

          {/* Cyber Pulse Animation */}
          <div className="relative">
            <div className="w-32 h-32 rounded-full border-2 border-primary/20 animate-ping absolute" />
            <div className="w-32 h-32 rounded-full border-2 border-primary/40 animate-pulse flex items-center justify-center bg-background shadow-inner">
              {step === "verification" ? (
                <ShieldCheck size={40} className="text-primary" />
              ) : (
                <RefreshCw size={40} className="text-primary animate-spin" />
              )}
            </div>
          </div>

          <div className="text-center space-y-6 relative z-10">
            <div className="space-y-1">
              <h2 className="text-2xl font-black tracking-tight uppercase tracking-[0.2em]">
                {step === "enriching" ? "Searching Neural Net" : step === "injecting" ? "Synchronizing Data Streams" : "Finalizing System Integrity"}
              </h2>
              <p className="text-xs text-muted-foreground font-medium italic">
                {step === "enriching" ? "Querying LCSC/Mouser/Digikey API for missing price data..." : step === "injecting" ? "Mapping multi-layered relations into PostgreSQL database..." : "Performing deep scan of relational integrity..."}
              </p>
            </div>

            {/* Step Checklist */}
            <div className="flex flex-col items-start gap-3 bg-muted/20 p-6 rounded-2xl border border-border mx-auto w-72">
              {[
                { label: "Parsing Excel Blobs", done: true },
                { label: "Neural Search", done: step === "injecting" || step === "verification", active: step === "enriching" && autoEnrich, hidden: !autoEnrich },
                { label: "Relational Mapping", done: step === "verification", active: step === "injecting" },
                { label: "Atomic DB Write", done: step === "verification", active: step === "injecting" },
                { label: "Integrity Audit", done: false, active: step === "verification" }
              ].filter(s => !s.hidden).map(s => (
                <div key={s.label} className={cn("flex items-center gap-3 text-[10px] font-black uppercase tracking-widest", s.done ? "text-green-500" : s.active ? "text-primary animate-pulse" : "text-muted-foreground opacity-30")}>
                  {s.done ? <Check size={12} strokeWidth={4} /> : <div className={cn("w-3 h-3 rounded-full border-2", s.active ? "border-primary border-t-transparent animate-spin" : "border-muted")} />}
                  {s.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: Finished (System Health Dashboard) ── */}
      {step === "finished" && (
        <div className="space-y-8 animate-in zoom-in-95 duration-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-[24px] bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)] flex items-center justify-center text-white">
                <Check size={36} strokeWidth={3} />
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-tight">
                  Injection Successful
                </h2>
                <p className="text-xs font-black text-green-600 uppercase tracking-[0.2em] mt-1">
                  Ecosystem Status: Fully Operational
                </p>
              </div>
            </div>
            <button
              onClick={reset}
              className="px-8 py-3 rounded-2xl border-2 border-border font-black text-xs uppercase tracking-widest hover:bg-muted transition-all active:scale-95"
            >
              Return to Admin Hub
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Health Score Card */}
            <div className="lg:col-span-4 bg-card border border-border rounded-[40px] p-10 flex flex-col items-center justify-center text-center gap-6 shadow-sm shadow-green-500/5">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="12"
                    className="text-muted/20"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="12"
                    strokeDasharray={440}
                    strokeDashoffset={
                      440 - (440 * (integrity?.healthScore ?? 100)) / 100
                    }
                    className="text-green-500 transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute flex flex-col items-center gap-0">
                  <span className="text-4xl font-black tracking-tighter">
                    {integrity?.healthScore ?? 100}%
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                    Health Score
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-black uppercase tracking-widest">
                  Relational Integrity
                </p>
                <p className="text-[11px] text-muted-foreground font-medium italic leading-relaxed">
                  {integrity?.healthScore === 100
                    ? "System is perfectly synchronized with no orphaned records or data gaps."
                    : "Integrity audit completed with minor anomalies detected."}
                </p>
              </div>
            </div>

            {/* Metrics & Breakdown */}
            <div className="lg:col-span-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    label: "BOM Linkage",
                    status: integrity?.checks.orphanedBOM ? "Valid" : "Broken",
                    icon: GitBranch,
                    color: integrity?.checks.orphanedBOM
                      ? "green"
                      : "destructive",
                  },
                  {
                    label: "Price Coverage",
                    status: integrity?.checks.completeInventory
                      ? "Full"
                      : "Partial",
                    icon: DollarSign,
                    color: integrity?.checks.completeInventory
                      ? "green"
                      : "amber",
                  },
                  {
                    label: "PCB Populations",
                    status: integrity?.checks.populatedPCBs
                      ? "All Active"
                      : "Empty Found",
                    icon: Package,
                    color: integrity?.checks.populatedPCBs
                      ? "green"
                      : "destructive",
                  },
                  {
                    label: "Bundle Validity",
                    status: integrity?.checks.populatedSets
                      ? "Verified"
                      : "Invalid",
                    icon: Layers,
                    color: integrity?.checks.populatedSets
                      ? "green"
                      : "destructive",
                  },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="p-6 rounded-3xl bg-muted/10 border border-border flex items-center justify-between group hover:border-primary/20 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shadow-inner",
                          m.color === "green"
                            ? "bg-green-500/10 text-green-600"
                            : m.color === "amber"
                              ? "bg-amber-500/10 text-amber-600"
                              : "bg-destructive/10 text-destructive",
                        )}
                      >
                        <m.icon size={20} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                          {m.label}
                        </p>
                        <p className="text-sm font-black">{m.status}</p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        m.color === "green"
                          ? "bg-green-500"
                          : m.color === "amber"
                            ? "bg-amber-500"
                            : "bg-destructive",
                      )}
                    />
                  </div>
                ))}
              </div>

              {/* Statistical Log */}
              <div className="bg-card border border-border rounded-3xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/30">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Post-Import Audit Stream
                  </h3>
                </div>
                <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-8">
                  {[
                    {
                      label: "Orphaned BOMs",
                      val: integrity?.details.orphanedBOMCount ?? 0,
                      unit: "rows",
                    },
                    {
                      label: "Empty PCBs",
                      val: integrity?.details.emptyPCBsCount ?? 0,
                      unit: "assemblies",
                    },
                    {
                      label: "Unpriced Parts",
                      val: integrity?.details.unpricedItemsCount ?? 0,
                      unit: "entries",
                    },
                    {
                      label: "Total Synced",
                      val: analysis?.itemsImported ?? 0,
                      unit: "master items",
                    },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground opacity-60 mb-1">
                        {s.label}
                      </p>
                      <p className="text-xl font-black tabular-nums">{s.val}</p>
                      <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-40">
                        {s.unit}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Backup Tab ────────────────────────────────────────────────────────────

function BackupTab() {
  const [loading, setLoading] = useState(false);
  const token = getToken() ?? "";

  const { data: settings } = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const { data: history } = useAutoBackups();

  const autoEnabled = settings?.auto_backup_enabled === "true";
  const interval = Number(settings?.auto_backup_interval || "30");
  const lastRun = settings?.last_auto_backup_at;

  async function handleBackup() {
    setLoading(true);
    try {
      await downloadBackup(token);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAuto(val: boolean) {
    await updateSettings.mutateAsync({ auto_backup_enabled: String(val) });
  }

  async function changeInterval(val: string) {
    await updateSettings.mutateAsync({ auto_backup_interval: val });
  }

  return (
    <div className="flex flex-col gap-8  text-foreground">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-foreground">
        {/* Left Column: Manual & Settings */}
        <div className="space-y-8 text-foreground text-foreground">
          <div className="space-y-4 text-foreground">
            <h2 className="text-lg font-black tracking-tight flex items-center gap-2 text-foreground">
              <HardDrive size={18} className="text-primary text-primary" />
              Ecosystem Archive
            </h2>
            <p className="text-xs text-muted-foreground font-medium leading-relaxed max-w-md text-muted-foreground">
              Export the entire relational database into a standardized{" "}
              <span className="font-bold text-foreground">.XLSX</span> format
              for offline analysis or future disaster recovery.
            </p>
            <button
              onClick={handleBackup}
              disabled={loading}
              className="flex items-center gap-3 px-6 py-4 bg-primary text-primary-foreground rounded-2xl hover:opacity-90 disabled:opacity-50 text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-all active:scale-95 text-primary-foreground"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <Download size={16} strokeWidth={3} /> Download Complete
                  Backup
                </>
              )}
            </button>
          </div>

          <div className="p-6 rounded-2xl border border-border bg-muted/20 space-y-6 text-foreground">
            <div className="flex items-center justify-between text-foreground text-foreground">
              <div className="flex items-center gap-3 text-foreground">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm text-foreground",
                    autoEnabled
                      ? "bg-green-500/10 text-green-600"
                      : "bg-muted text-muted-foreground text-muted-foreground",
                  )}
                >
                  <Activity
                    size={20}
                    className={autoEnabled ? "animate-pulse" : ""}
                  />
                </div>
                <div className="text-foreground">
                  <h3 className="text-sm font-black uppercase tracking-widest text-foreground">
                    Smart Scheduling
                  </h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60 text-muted-foreground">
                    Automated recurring snapshots
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleAuto(!autoEnabled)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shadow-sm text-foreground",
                  autoEnabled
                    ? "bg-primary"
                    : "bg-muted border border-border text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-md",
                    autoEnabled ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </button>
            </div>

            <div
              className={cn(
                "space-y-4 transition-opacity text-foreground",
                !autoEnabled && "opacity-40 pointer-events-none",
              )}
            >
              <div className="space-y-2 text-foreground">
                <div className="flex justify-between items-center px-1 text-foreground">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-muted-foreground">
                    Backup Interval
                  </Label>
                  <span className="text-xs font-black text-primary tabular-nums text-primary">
                    {interval} Days
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="90"
                  step="1"
                  value={interval}
                  onChange={(e) => changeInterval(e.target.value)}
                  className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase bg-card p-3 rounded-xl border border-border/50 text-foreground">
                <div className="flex flex-col gap-0.5 text-foreground">
                  <span className="opacity-50 text-muted-foreground">
                    Last Successful Run:
                  </span>
                  <span className="text-foreground">
                    {lastRun ? new Date(lastRun).toLocaleString() : "NEVER"}
                  </span>
                </div>
                <div className="w-px h-6 bg-border text-foreground" />
                <div className="flex flex-col gap-0.5 text-foreground">
                  <span className="opacity-50 text-muted-foreground">
                    Next Execution:
                  </span>
                  <span className="text-primary text-primary">
                    Scheduled Daily Check
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: History */}
        <div className="flex flex-col gap-4 text-foreground">
          <div className="flex items-center gap-3 text-foreground text-foreground text-foreground">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 text-blue-600">
              <History size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-foreground">
                Historical Archives
              </h2>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-60 text-muted-foreground">
                Last 10 automated snapshots
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex-1 min-h-[300px] text-foreground">
            <div className="overflow-auto max-h-[500px] text-foreground">
              <table className="w-full text-sm border-collapse text-foreground">
                <thead className="bg-muted/30 text-foreground text-foreground">
                  <tr className="text-foreground">
                    <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border text-muted-foreground">
                      Snapshot Record
                    </th>
                    <th className="text-right px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border text-muted-foreground text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!history || history.length === 0 ? (
                    <tr className="text-foreground text-foreground text-foreground">
                      <td
                        colSpan={2}
                        className="text-center py-20 text-muted-foreground font-bold uppercase tracking-widest opacity-40 italic text-xs text-muted-foreground"
                      >
                        No automated snapshots detected
                      </td>
                    </tr>
                  ) : (
                    history.map((file, i) => (
                      <tr
                        key={file}
                        className={cn(
                          "border-b border-border/60 hover:bg-primary/[0.01] transition-all text-foreground text-foreground",
                          i % 2 !== 0 && "bg-muted/[0.01]",
                        )}
                      >
                        <td className="px-6 py-4 text-foreground">
                          <div className="flex items-center gap-3 text-foreground text-foreground">
                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground/50 border border-border text-muted-foreground text-muted-foreground">
                              <FileSpreadsheet size={14} />
                            </div>
                            <div className="min-w-0 text-foreground">
                              <p className="font-bold text-xs text-foreground truncate max-w-[200px] text-foreground">
                                {file}
                              </p>
                              <p className="text-[9px] text-muted-foreground font-medium uppercase text-muted-foreground text-muted-foreground">
                                System Snapshot
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-foreground">
                          <button
                            onClick={() => downloadAutoBackup(file, token)}
                            className="h-8 px-3 rounded-lg border border-border hover:border-primary/50 text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-primary transition-all text-foreground"
                          >
                            Extract
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex gap-4 text-foreground text-foreground text-foreground">
        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-600 text-amber-600">
          <History size={16} />
        </div>
        <p className="text-[10px] font-bold text-amber-800 leading-relaxed text-amber-700 text-amber-700">
          <span className="font-black uppercase tracking-tighter text-amber-800">
            Strategic Note:
          </span>{" "}
          Historical snapshots are stored on the secure server cluster.
          Downloading (Extracting) an archive allows for point-in-time recovery
          via the Injection tool.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const TABS: {
  id: Tab;
  label: string;
  icon: React.ReactNode;
  superOnly?: boolean;
}[] = [
  {
    id: "users",
    label: "Operators",
    icon: <Users size={15} />,
    superOnly: true,
  },
  { id: "changelog", label: "Audit Log", icon: <ScrollText size={15} /> },
  { id: "warehouse", label: "Warehouse", icon: <Warehouse size={15} /> },
  { id: "import", label: "Data Import", icon: <Upload size={15} /> },
  { id: "backup", label: "Backups", icon: <Download size={15} /> },
];

export default function AdminPage() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const superAdmin = isSuper(user);
  const { data: users } = useAdminUsers();
  const { data: logData } = useChangeLog({ limit: 1 });
  const { data: whData } = useWarehouse({ limit: 1 });

  const [tab, setTab] = useState<Tab>(superAdmin ? "users" : "changelog");

  if (!admin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center opacity-20 text-muted-foreground">
          <Lock size={32} />
        </div>
        <p className="text-sm font-bold uppercase tracking-widest opacity-50 text-muted-foreground">
          Restricted Access
        </p>
      </div>
    );
  }

  const visibleTabs = TABS.filter((t) => !t.superOnly || superAdmin);

  return (
    <div className="flex flex-col gap-6 p-1 text-foreground">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-6 pb-2">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-inner text-primary">
            <ShieldCheck size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black tracking-tighter leading-none">
                System{" "}
                <span className="text-primary text-sm align-top ml-1 uppercase">
                  Control
                </span>
              </h1>
              <Badge
                variant="outline"
                className="bg-primary/5 text-primary border-primary/20 text-[9px] font-black uppercase px-1.5 py-0"
              >
                Governance Center
              </Badge>
            </div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5 flex items-center gap-1.5 opacity-60">
              <Fingerprint size={10} /> Central Administration & System
              Integrity
            </p>
          </div>
        </div>
      </div>

      {/* ── Summary Stats ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-foreground text-foreground">
        <MetricCard
          label="Total System Users"
          value={users?.length}
          icon={Users}
          subValue="authorized accounts"
        />
        <MetricCard
          label="Audit Footprint"
          value={logData?.total}
          icon={History}
          variant="info"
          subValue="total changes logged"
        />
        <MetricCard
          label="Warehouse Coverage"
          value={whData?.total}
          icon={Database}
          variant="success"
          subValue="items tracked"
        />
        <MetricCard
          label="Last System Backup"
          value="Today"
          icon={HardDrive}
          variant="warn"
          subValue="regular maintenance"
        />
      </div>

      {/* ── Navigation ─────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border bg-muted/10 p-1 rounded-t-xl text-foreground text-foreground">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all rounded-lg text-foreground",
              tab === t.id
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            {t.icon &&
              React.cloneElement(t.icon as React.ReactElement, {
                size: 13,
                strokeWidth: 3,
              })}
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 bg-card border-x border-b border-border rounded-b-xl p-6 shadow-sm text-foreground text-foreground">
        {tab === "users" && superAdmin && <UsersTab currentUserId={user?.id} />}
        {tab === "changelog" && <ChangeLogTab />}
        {tab === "warehouse" && <WarehouseTab />}
        {tab === "import" && <ImportTab />}
        {tab === "backup" && <BackupTab />}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isSuper } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { KeyRound, Eye, EyeOff, RefreshCw, Lock, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiKeyState {
  mouserKey: string;
  digikeyClientId: string;
  digikeyClientSecret: string;
  sources: { mouser: string; digikeyId: string; digikeySecret: string };
}

interface EditForm {
  mouserKey: string;
  digikeyClientId: string;
  digikeyClientSecret: string;
  confirmPassword: string;
}

const EMPTY_FORM: EditForm = {
  mouserKey: "",
  digikeyClientId: "",
  digikeyClientSecret: "",
  confirmPassword: "",
};

export default function ConfigurePage() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKeyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);

  const fetchKeys = async () => {
    try {
      const res = await api.get("/admin/api-keys");
      setKeys(res.data);
    } catch {
      toast.error("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuper(user)) fetchKeys();
    else setLoading(false);
  }, [user]);

  const openModal = () => {
    setForm(EMPTY_FORM);
    setPasswordError("");
    setShowSecret(false);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.confirmPassword) {
      setPasswordError("Password required");
      return;
    }
    const hasAnyKey = form.mouserKey || form.digikeyClientId || form.digikeyClientSecret;
    if (!hasAnyKey) {
      toast.error("Enter at least one key to update");
      return;
    }
    setSaving(true);
    setPasswordError("");
    try {
      await api.put("/admin/api-keys", {
        mouserKey: form.mouserKey || undefined,
        digikeyClientId: form.digikeyClientId || undefined,
        digikeyClientSecret: form.digikeyClientSecret || undefined,
        confirmPassword: form.confirmPassword,
      });
      toast.success("API keys updated");
      setModalOpen(false);
      await fetchKeys();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string }; status?: number } };
      if (err.response?.status === 401) {
        setPasswordError("Incorrect password");
      } else {
        toast.error(err.response?.data?.error ?? "Failed to update keys");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isSuper(user)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center opacity-20">
          <Lock size={32} />
        </div>
        <p className="text-sm font-black uppercase tracking-widest opacity-50">
          Restricted Access
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-1 text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between gap-6 pb-2">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-inner text-primary">
            <KeyRound size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black tracking-tighter leading-none">
                API{" "}
                <span className="text-primary text-sm align-top ml-1 uppercase">
                  Keys
                </span>
              </h1>
              <Badge
                variant="outline"
                className="bg-primary/5 text-primary border-primary/20 text-[9px] font-black uppercase px-1.5 py-0"
              >
                Super Admin
              </Badge>
            </div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5 flex items-center gap-1.5 opacity-60">
              <Fingerprint size={10} /> Supplier API Credential Management
            </p>
          </div>
        </div>

        <button
          onClick={openModal}
          className="flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <KeyRound size={13} />
          Edit Keys
        </button>
      </div>

      {/* Keys Card */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/20">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Supplier Credentials
          </p>
        </div>

        {loading ? (
          <div className="px-6 py-10 flex items-center justify-center">
            <RefreshCw size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            <KeyRow
              label="Mouser API Key"
              supplier="mouser"
              value={keys?.mouserKey}
              source={keys?.sources.mouser}
            />
            <KeyRow
              label="DigiKey Client ID"
              supplier="digikey"
              value={keys?.digikeyClientId}
              source={keys?.sources.digikeyId}
            />
            <KeyRow
              label="DigiKey Client Secret"
              supplier="digikey"
              value={keys?.digikeyClientSecret}
              source={keys?.sources.digikeySecret}
            />
          </div>
        )}
      </div>

      {/* Info note */}
      <p className="text-[11px] text-muted-foreground opacity-60 leading-relaxed">
        DB values override <code className="font-mono">.env</code>. Changes take effect immediately — no restart needed. DigiKey token cache clears automatically on update.
      </p>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
            <div className="px-6 py-5 border-b border-border">
              <h2 className="text-base font-black uppercase tracking-wider text-foreground">
                Update API Keys
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank to keep current value. Password confirmation required.
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              <ModalField
                label="Mouser API Key"
                value={form.mouserKey}
                onChange={(v) => setForm((f) => ({ ...f, mouserKey: v }))}
                placeholder="New key (optional)"
              />
              <ModalField
                label="DigiKey Client ID"
                value={form.digikeyClientId}
                onChange={(v) => setForm((f) => ({ ...f, digikeyClientId: v }))}
                placeholder="New Client ID (optional)"
              />

              {/* DigiKey Secret with show/hide */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  DigiKey Client Secret
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    value={form.digikeyClientSecret}
                    onChange={(e) => setForm((f) => ({ ...f, digikeyClientSecret: e.target.value }))}
                    placeholder="New Client Secret (optional)"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Password confirm */}
              <div className="border-t border-border pt-4 space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Confirm Your Password <span className="text-destructive">*</span>
                </label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, confirmPassword: e.target.value }));
                    setPasswordError("");
                  }}
                  placeholder="Your account password"
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className={cn(
                    "w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1",
                    passwordError
                      ? "border-destructive focus:ring-destructive/40"
                      : "border-border focus:ring-primary/40"
                  )}
                />
                {passwordError && (
                  <p className="text-xs text-destructive font-medium">{passwordError}</p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className="text-sm text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving && <RefreshCw size={12} className="animate-spin" />}
                Save Keys
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KeyRow({
  label,
  supplier,
  value,
  source,
}: {
  label: string;
  supplier: "mouser" | "digikey";
  value?: string;
  source?: string;
}) {
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black",
            supplier === "mouser"
              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              : "bg-orange-500/10 text-orange-400 border border-orange-500/20"
          )}
        >
          {supplier === "mouser" ? "M" : "DK"}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="font-mono text-sm text-foreground mt-0.5 truncate">
            {value || <span className="text-muted-foreground/40 italic not-italic font-sans text-xs">not set</span>}
          </p>
        </div>
      </div>

      <SourceBadge source={source} />
    </div>
  );
}

function SourceBadge({ source }: { source?: string }) {
  if (source === "db") {
    return (
      <span className="shrink-0 text-[10px] px-2 py-0.5 rounded border font-black uppercase tracking-wide bg-green-500/10 text-green-500 border-green-500/20">
        DB
      </span>
    );
  }
  if (source === "env") {
    return (
      <span className="shrink-0 text-[10px] px-2 py-0.5 rounded border font-black uppercase tracking-wide bg-muted text-muted-foreground border-border">
        ENV
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded border font-black uppercase tracking-wide bg-destructive/10 text-destructive border-destructive/20">
      missing
    </span>
  );
}

function ModalField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
      />
    </div>
  );
}

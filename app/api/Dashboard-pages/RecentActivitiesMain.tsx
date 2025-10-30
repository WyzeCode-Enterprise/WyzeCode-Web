"use client";

import React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/app/hooks/useAuth";
import {
    AnimatePresence,
    LayoutGroup,
    motion,
    useReducedMotion,
} from "framer-motion";
import type { Variants } from "framer-motion";

/* ---------------- Types ---------------- */
type Activity = {
    id: number;
    type: string;
    status: string;
    description: string | null;
    amount_cents: number | null;
    currency: string | null;
    source: string | null;
    ip: string | null;
    user_agent: string | null;
    icon_url?: string | null;
    created_at: string;

    // ====== Campos avançados para auditoria ======
    request_id?: string | null;
    correlation_id?: string | null;
    session_id?: string | null;
    device_id?: string | null;
    kyc_level?: string | null;
    risk_score?: number | null;
    risk_flags?: string[] | null;
    environment?: "prod" | "sandbox" | "dev" | string;

    location?: {
        country?: string | null;
        region?: string | null;
        city?: string | null;
        asn?: string | null;
    } | null;

    http?: {
        method?: string | null;
        path?: string | null;
        status?: number | null;
        latency_ms?: number | null;
        idempotency_key?: string | null;
    } | null;

    tls?: {
        version?: string | null;
        cipher?: string | null;
    } | null;

    payment?: {
        card_brand?: string | null;
        card_last4?: string | null;
        installment_count?: number | null;
        gateway_code?: string | null;
        chargeback?: boolean | null;
    } | null;

    webhook?: {
        attempts?: number | null;
        last_status?: string | null;
    } | null;

    mfa?: {
        used?: boolean | null;
        method?: string | null;
    } | null;

    customer_id?: string | null;
    merchant_id?: string | null;
};

interface Props {
    userName: string;
    userEmail: string;
}

/* ---------------- Small helpers ---------------- */
const statusStyles: Record<string, string> = {
    success: "bg-emerald-500/10 text-emerald-300 border border-emerald-400/30",
    failed: "bg-red-500/10 text-red-300 border border-red-400/30",
    pending: "bg-yellow-500/10 text-yellow-200 border border-yellow-400/30",
};

function SafeStatus({ value }: { value?: string }) {
    const cls = value ? statusStyles[value] ?? statusStyles.pending : statusStyles.pending;
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium ${cls}`}>
            {value ?? "pending"}
        </span>
    );
}

function safeCurrency(c: string | null | undefined) {
    const cur = (c ?? "BRL").toString().trim().toUpperCase();
    return /^[A-Z]{3}$/.test(cur) ? cur : "BRL";
}

function formatAmount(amount_cents: number | null, currency: string | null) {
    if (amount_cents == null) return "—";
    const cur = safeCurrency(currency);
    try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: cur }).format(amount_cents / 100);
    } catch {
        return `R$ ${(amount_cents / 100).toFixed(2)}`;
    }
}

function fallbackIcon(type?: string, source?: string): string {
    if (type?.startsWith("payment")) return "/icons/wallet.svg";
    if (type === "refund") return "/icons/refund.svg";
    if (type === "login") return "/icons/login.svg";
    if (type === "kyc.updated") return "/icons/id.svg";
    if (source === "webhook") return "/icons/webhook.svg";
    return "/icons/activity.svg";
}

/* ---------------- Badges/Copy/Risk/Mobile ---------------- */
function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <span className={`inline-flex items-center rounded-md border border-white/10 px-2 py-[2px] text-[11px] text-white/70 ${className}`}>
            {children}
        </span>
    );
}

function Copyable({ text, children, title }: { text?: string | null; children: React.ReactNode; title?: string }) {
    const val = (text ?? "").toString();
    const canCopy = !!val;
    return (
        <button
            title={title || (canCopy ? "Copiar" : "Nada para copiar")}
            disabled={!canCopy}
            onClick={() => { if (canCopy) try { navigator.clipboard.writeText(val); } catch { } }}
            className={`inline-flex items-center gap-1 hover:text-white/90 ${canCopy ? "text-white/70" : "text-white/40"} disabled:cursor-not-allowed`}
        >
            {children}
            {canCopy && (
                <svg width="12" height="12" viewBox="0 0 20 20" className="opacity-70">
                    <path fill="currentColor" d="M4 3h9v2H6v9H4V3zm4 4h9v10H8V7zm2 2v6h5V9h-5z" />
                </svg>
            )}
        </button>
    );
}

function maskId(id?: string | null) {
    if (!id) return "—";
    const s = id.toString();
    if (s.length <= 8) return s;
    return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function RiskPill({ score }: { score?: number | null }) {
    if (score == null) return <Badge>risk: —</Badge>;
    let cls = "border-white/15 text-white/80";
    if (score >= 80) cls = "border-red-400/40 text-red-300 bg-red-500/10";
    else if (score >= 50) cls = "border-yellow-400/40 text-yellow-200 bg-yellow-500/10";
    else cls = "border-emerald-400/40 text-emerald-200 bg-emerald-500/10";
    return <Badge className={cls}>risk: {score}</Badge>;
}

function useIsMobile(breakpointPx = 1250) {
    const [isMobile, setIsMobile] = React.useState(false);
    React.useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
        const update = () => setIsMobile(mq.matches);
        update();
        mq.addEventListener?.("change", update);
        return () => mq.removeEventListener?.("change", update);
    }, [breakpointPx]);
    return isMobile;
}

/* ---------------- UA parsing (tempo real) ---------------- */
type UAInfo = { browser: string; os: string; version?: string };

function normalizeBrand(b?: string) {
    if (!b) return "";
    return b.replace(/google\s+/i, "").replace(/internet/i, "Internet").replace(/\s+/g, " ").trim();
}

function parseFromUAString(uaRaw?: string | null): UAInfo {
    const ua = String(uaRaw || "");
    const u = ua.toLowerCase();

    let browser = "Desconhecido";
    let version = "";

    const pick = (name: string, re: RegExp) => {
        const m = ua.match(re);
        if (m) { browser = name; version = (m[1] || m[2] || "") as string; }
    };

    if (/edg(a|ios)?\//i.test(ua)) pick("Edge", /Edg(?:A|iOS|)\/([\d.]+)/);
    else if (/opr\//i.test(ua)) pick("Opera", /OPR\/([\d.]+)/);
    else if (/vivaldi\//i.test(ua)) pick("Vivaldi", /Vivaldi\/([\d.]+)/);
    else if (/yabrowser\//i.test(ua)) pick("Yandex", /YaBrowser\/([\d.]+)/);
    else if (/samsungbrowser\//i.test(ua)) pick("Samsung Internet", /SamsungBrowser\/([\d.]+)/);
    else if (/firefox\/|fxios\//i.test(ua)) pick("Firefox", /(Firefox|FxiOS)\/([\d.]+)/);
    else if (/crios\//i.test(ua)) pick("Chrome", /CriOS\/([\d.]+)/);
    else if (/chrome\//i.test(ua) && !/edg|opr|yabrowser|vivaldi/i.test(ua)) pick("Chrome", /Chrome\/([\d.]+)/);
    else if (/safari/i.test(ua) && /version\//i.test(ua)) pick("Safari", /Version\/([\d.]+)/);

    let os = "Desconhecido";
    if (u.includes("windows")) {
        os = "Windows";
    } else if (u.includes("android")) {
        const m = ua.match(/Android\s([\d.]+)/i);
        os = `Android${m ? " " + m[1] : ""}`;
    } else if (/iphone|ipad|ipod|ios/i.test(ua)) {
        const m = ua.match(/OS\s([\d_]+)/i);
        os = `iOS${m ? " " + m[1].replace(/_/g, ".") : ""}`;
    } else if (u.includes("mac os x") || u.includes("macintosh")) {
        const m = ua.match(/Mac OS X\s([\d_]+)/i);
        os = `macOS${m ? " " + m[1].replace(/_/g, ".") : ""}`;
    } else if (u.includes("linux")) {
        os = "Linux";
    }

    return { browser, os, version };
}

export function parseUA(ua?: string | null): UAInfo {
    return parseFromUAString(ua);
}

export function useLiveUA(): UAInfo {
    const [info, setInfo] = React.useState<UAInfo>({ browser: "—", os: "—", version: "" });

    React.useEffect(() => {
        let cancelled = false;
        async function read() {
            try {
                const anyNav = navigator as any;
                if (anyNav.userAgentData) {
                    const uaData = anyNav.userAgentData;
                    const brands: Array<{ brand: string; version: string }> = uaData.brands || uaData.uaList || [];
                    let brand =
                        brands.find(b => /Chrome|Chromium|Edge|Opera|Brave|Vivaldi|Samsung|YaBrowser|Yandex/i.test(b.brand))?.brand ||
                        brands[brands.length - 1]?.brand || "";
                    const high = await (uaData.getHighEntropyValues?.(["platform", "platformVersion", "uaFullVersion"]).catch(() => null));
                    const platform = (high?.platform || uaData.platform || navigator.platform || "").toString();

                    let os = "Desconhecido";
                    if (/win/i.test(platform)) os = "Windows";
                    else if (/mac/i.test(platform)) os = "macOS";
                    else if (/android/i.test(platform)) os = "Android";
                    else if (/ios|iphone|ipad/i.test(platform)) os = "iOS";
                    else if (/linux/i.test(platform)) os = "Linux";

                    const browser = normalizeBrand(brand) || "Chromium";
                    const version = high?.uaFullVersion || "";

                    if (!cancelled) setInfo({ browser, os, version });
                    return;
                }
                const parsed = parseFromUAString(navigator.userAgent);
                if (!cancelled) setInfo(parsed);
            } catch { }
        }
        read();
        const onFocus = () => read();
        window.addEventListener("focus", onFocus);
        return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
    }, []);

    return info;
}

/* ---------------- Query intelligence ---------------- */
type ParsedQuery = {
    raw: string;
    idEquals?: number | null;
    types: string[];
    statuses: string[];
    sources: string[];
    currency?: string;
    amountOp?: ">" | ">=" | "<" | "<=" | "=";
    amountValue?: number;
    terms: string[];
};

const normalize = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

const formatIdTag = (id: number) => `#${String(id).padStart(8, "0")}`;
const parseIdTag = (s: string): number | null => {
    const m = s.trim().match(/^#0*(\d+)$/);
    return m ? Number(m[1]) : null;
};

function parseMoneyToNumberBRorUS(token: string): number | undefined {
    let t = token.replace(/[^\d,.\s]/g, "").trim();
    if (!t) return undefined;
    const lastComma = t.lastIndexOf(",");
    const lastDot = t.lastIndexOf(".");
    let decimalSep: "." | "," | null = null;
    if (lastComma === -1 && lastDot === -1) decimalSep = null;
    else if (lastComma > lastDot) decimalSep = ",";
    else decimalSep = ".";
    if (decimalSep === ",") t = t.replace(/\./g, "").replace(",", ".");
    else if (decimalSep === ".") t = t.replace(/,/g, "");
    const num = Number(t);
    return Number.isFinite(num) ? num : undefined;
}

function parseQuery(q: string): ParsedQuery {
    const raw = q || "";
    const tokens = raw.split(/\s+/).filter(Boolean);

    const types: string[] = [];
    const statuses: string[] = [];
    const sources: string[] = [];
    const terms: string[] = [];
    let currency: string | undefined;
    let amountOp: ParsedQuery["amountOp"];
    let amountValue: number | undefined;
    let idEquals: number | null | undefined;

    for (const tok of tokens) {
        const t = tok.toLowerCase();

        if (t.startsWith("#")) {
            const id = parseIdTag(tok);
            if (id != null) { idEquals = id; continue; }
        }
        if (t.startsWith("type:") || t.startsWith("tipo:") || t.startsWith("event:") || t.startsWith("evento:")) {
            types.push(tok.split(":")[1] || ""); continue;
        }
        if (t.startsWith("status:") || t.startsWith("estado:")) {
            statuses.push(tok.split(":")[1] || ""); continue;
        }
        if (t.startsWith("source:") || t.startsWith("origem:")) {
            sources.push(tok.split(":")[1] || ""); continue;
        }
        if (t.startsWith("currency:") || t.startsWith("moeda:")) {
            const c = (tok.split(":")[1] || "").toUpperCase();
            if (/^[A-Z]{3}$/.test(c)) currency = c; continue;
        }
        if (t.startsWith("amount:") || t.startsWith("valor:") || t.startsWith("value:")) {
            const rawVal = tok.split(":")[1] || "";
            const m = rawVal.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
            if (m) {
                amountOp = (m[1] as any) || "=";
                const num = parseMoneyToNumberBRorUS(m[2]);
                if (num != null) amountValue = num;
            }
            continue;
        }
        const m2 = t.match(/^(>=|<=|>|<|=)\s*(.+)$/);
        if (m2) {
            amountOp = m2[1] as any;
            const num = parseMoneyToNumberBRorUS(m2[2]);
            if (num != null) amountValue = num;
            continue;
        }
        if (/^r\$\s*[\d.,]+$/i.test(tok)) {
            amountOp = amountOp || "=";
            const num = parseMoneyToNumberBRorUS(tok);
            if (num != null) amountValue = num;
            continue;
        }
        terms.push(tok);
    }

    return { raw, idEquals, types, statuses, sources, currency, amountOp, amountValue, terms };
}

function amountMatches(a: Activity, op?: ParsedQuery["amountOp"], value?: number): boolean {
    if (!op || value == null) return true;
    const amt = (a.amount_cents ?? 0) / 100;
    switch (op) {
        case ">": return amt > value;
        case ">=": return amt >= value;
        case "<": return amt < value;
        case "<=": return amt <= value;
        case "=": return Math.abs(amt - value) < 0.00001;
        default: return true;
    }
}

function textIncludesWhere(a: Activity, term: string): boolean {
    const nterm = normalize(term);
    if (!nterm) return true;
    const pool = [
        a.type,
        a.description || "",
        a.source || "",
        a.ip || "",
        a.user_agent || "",
        new Date(a.created_at).toLocaleString("pt-BR"),
    ].map(normalize).join(" ");
    return pool.includes(nterm);
}

function typeMatches(a: Activity, types: string[]): boolean {
    if (!types.length) return true;
    const atype = normalize(a.type);
    return types.some((t) => atype.includes(normalize(t)));
}
function statusMatches(a: Activity, statuses: string[]): boolean {
    if (!statuses.length) return true;
    const s = (a.status || "").toLowerCase();
    return statuses.some((t) => s.includes(t.toLowerCase()));
}
function sourceMatches(a: Activity, sources: string[]): boolean {
    if (!sources.length) return true;
    const s = (a.source || "").toLowerCase();
    return sources.some((t) => s.includes(t.toLowerCase()));
}
function currencyMatches(a: Activity, currency?: string): boolean {
    if (!currency) return true;
    return safeCurrency(a.currency) === currency.toUpperCase();
}

function scoreActivity(a: Activity, pq: ParsedQuery): number {
    let score = 0;
    if (pq.idEquals != null) score += a.id === pq.idEquals ? 999 : -999;
    const atype = normalize(a.type);
    for (const t of pq.types) {
        const nt = normalize(t);
        if (nt && atype.startsWith(nt)) score += 5;
        else if (nt && atype.includes(nt)) score += 3;
    }
    if (amountMatches(a, pq.amountOp, pq.amountValue)) {
        if (pq.amountValue != null) score += 2;
    } else {
        score -= 5;
    }
    for (const term of pq.terms) {
        if (textIncludesWhere(a, term)) score += 1;
    }
    return score;
}

function smartFilterAndRank(list: Activity[], q: string): Activity[] {
    const pq = parseQuery(q);
    const filtered = list.filter((a) =>
        (pq.idEquals == null || a.id === pq.idEquals) &&
        typeMatches(a, pq.types) &&
        statusMatches(a, pq.statuses) &&
        sourceMatches(a, pq.sources) &&
        currencyMatches(a, pq.currency) &&
        pq.terms.every((t) => textIncludesWhere(a, t)) &&
        amountMatches(a, pq.amountOp, pq.amountValue)
    );
    return filtered
        .map((a) => ({ a, s: scoreActivity(a, pq) }))
        .sort((x, y) => y.s - x.s)
        .map((x) => x.a);
}

/* ---------------- MenuSelect custom ---------------- */
type Opt = { value: string; label: string };

function MenuSelect({
    value, onChange, placeholder, options, className = "", placement = "bottom",
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    options: { value: string; label: string }[];
    className?: string;
    placement?: "top" | "bottom";
}) {
    const [open, setOpen] = React.useState(false);
    const btnRef = React.useRef<HTMLButtonElement | null>(null);
    const listRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (!open) return;
            const t = e.target as Node;
            if (btnRef.current?.contains(t)) return;
            if (listRef.current?.contains(t)) return;
            setOpen(false);
        }
        window.addEventListener("mousedown", handleOutside);
        return () => window.removeEventListener("mousedown", handleOutside);
    }, [open]);

    const selected = options.find((o) => o.value === value)?.label || "";

    return (
        <div className={`relative ${className}`}>
            <button
                ref={btnRef}
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full rounded-md bg-[#0a0a0a] border border-white/10 px-3 py-3 text-sm text-white/90 hover:bg-white/5 transition flex items-center justify-between"
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className={selected ? "" : "text-white/40"}>{selected || placeholder}</span>
                <svg width="16" height="16" viewBox="0 0 20 20" className="opacity-70">
                    <path fill="currentColor" d="M5 7l5 5l5-5H5z" />
                </svg>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        ref={listRef}
                        role="listbox"
                        initial={{ opacity: 0, y: placement === "top" ? 6 : -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: placement === "top" ? 6 : -6, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className={`absolute z-20 ${placement === "top" ? "bottom-full mb-1" : "mt-1"} w-64 rounded-md border border-white/10 bg-[#0b0b0b] shadow-2xl backdrop-blur-sm overflow-hidden`}
                    >
                        {options.map((opt) => {
                            const active = value === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    role="option"
                                    aria-selected={active}
                                    onClick={() => { onChange(opt.value); setOpen(false); }}
                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${active ? "bg-white/10 text-white" : "hover:bg-white/5 text-white/80"
                                        }`}
                                >
                                    <span>{opt.label}</span>
                                    {active && (
                                        <svg width="16" height="16" viewBox="0 0 20 20">
                                            <path fill="currentColor" d="M7.629 13.233L3.4 9.004l1.2-1.2l3.029 3.028l7.371-7.37l1.2 1.2z" />
                                        </svg>
                                    )}
                                </button>
                            );
                        })}
                        {value && (
                            <div className="border-t border-white/10">
                                <button onClick={() => onChange("")} className="w-full px-3 py-2 text-left text-xs text-white/60 hover:bg-white/5">
                                    Limpar filtro
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ---------------- Utils ---------------- */
function useKey(k: string, handler: () => void) {
    React.useEffect(() => {
        function onDown(e: KeyboardEvent) {
            const hotkey = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === k.toLowerCase();
            if (hotkey) { e.preventDefault(); handler(); }
        }
        window.addEventListener("keydown", onDown);
        return () => window.removeEventListener("keydown", onDown);
    }, [handler, k]);
}

/* ---------------- Search Overlay ---------------- */
type SearchChoice =
    | { kind: "query"; query: string }
    | { kind: "id"; id: number; display: string; activity?: Activity };

function AIPalette({
    open, onClose, onPick, defaultQuery = "",
}: {
    open: boolean;
    onClose: () => void;
    onPick: (choice: SearchChoice) => void;
    defaultQuery?: string;
}) {
    const [query, setQuery] = React.useState(defaultQuery);
    const [results, setResults] = React.useState<Activity[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [activeIdx, setActiveIdx] = React.useState<number>(-1);

    const parsed = React.useMemo(() => parseQuery(query), [query]);
    const liveUA = useLiveUA();

    React.useEffect(() => {
        if (open) {
            setQuery(defaultQuery);
            setResults([]);
            setLoading(false);
            setActiveIdx(-1);
        }
    }, [open, defaultQuery]);

    React.useEffect(() => {
        if (!open) return;
        const ac = new AbortController();
        const t = setTimeout(async () => {
            try {
                setLoading(true);
                const params = new URLSearchParams({ page: "1", pageSize: "30", q: query.trim() });
                const res = await fetch(`/api/recent-activities?${params.toString()}`, { credentials: "include", signal: ac.signal });
                if (res.ok) {
                    const json = await res.json();
                    const base: Activity[] = Array.isArray(json.items) ? json.items : [];
                    setResults(smartFilterAndRank(base, query).slice(0, 15));
                } else {
                    setResults([]);
                }
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 220);
        return () => { clearTimeout(t); ac.abort(); };
    }, [open, query]);

    React.useEffect(() => {
        function onEsc(e: KeyboardEvent) { if (open && e.key === "Escape") onClose(); }
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    function chooseByIdx(idx: number) {
        if (idx >= 0 && idx < results.length) {
            const r = results[idx];
            onPick({ kind: "id", id: r.id, display: formatIdTag(r.id), activity: r });
        } else {
            const trimmed = query.trim();
            if (trimmed) onPick({ kind: "query", query: trimmed });
            else onPick({ kind: "query", query: "" }); // ⬅️ Enter com vazio => limpar busca global
        }
    }

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                {/* Backdrop */}
                <motion.div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                />

                {/* Card central (bottom-sheet no mobile) */}
                <motion.div
                    className="relative z-[61] w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#0b0b0b]/95 shadow-2xl"
                    initial={{ y: 20, scale: 0.98, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    exit={{ y: 10, scale: 0.98, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    style={{ maxHeight: "80vh" }}
                >
                    <div className="p-4 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <span className="text-white/60 text-xs px-2 py-[2px] rounded-md border border-white/10">Ctrl + K</span>
                            <span className="text-white/40 text-xs">Abra a busca rápida</span>
                        </div>
                        <div className="mt-3 relative">
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setActiveIdx(-1); }}
                                placeholder="Ex.: #00000042  type:payment.created  amount:>100  moeda:BRL  status:success  webhook  chargeback…"
                                className="w-full rounded-lg bg-[#0a0a0a] border border-white/10 px-4 py-3 text-sm outline-none focus:border-white/20 pr-10" // ⬅️ espaço pro X
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (query.trim() === "") {
                                            onPick({ kind: "query", query: "" }); // ⬅️ Enter com vazio => limpar busca
                                        } else {
                                            chooseByIdx(activeIdx);
                                        }
                                    } else if (e.key === "ArrowDown") {
                                        e.preventDefault(); setActiveIdx((i) => Math.min((i < 0 ? -1 : i) + 1, results.length - 1));
                                    } else if (e.key === "ArrowUp") {
                                        e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1));
                                    }
                                }}
                            />
{query.length > 0 && (
  <button
    type="button"
    aria-label="Limpar texto"
    title="Limpar texto"
    onClick={() => setQuery("")}
    className="absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-[7px] border border-white/10 text-xs text-white/70 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/20"
  >
    <span aria-hidden className="leading-none">×</span>
  </button>
)}
                        </div>

                        {/* Chips dos filtros compreendidos */}
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                            {parsed.idEquals != null && <span className="rounded border border-white/10 px-2 py-[2px] text-white/70">id:{formatIdTag(parsed.idEquals)}</span>}
                            {parsed.types.map((t) => <span key={`t-${t}`} className="rounded border border-white/10 px-2 py-[2px] text-white/70">type:{t}</span>)}
                            {parsed.statuses.map((s) => <span key={`s-${s}`} className="rounded border border-white/10 px-2 py-[2px] text-white/70">status:{s}</span>)}
                            {parsed.sources.map((s) => <span key={`so-${s}`} className="rounded border border-white/10 px-2 py-[2px] text-white/70">source:{s}</span>)}
                            {parsed.currency && <span className="rounded border border-white/10 px-2 py-[2px] text-white/70">currency:{parsed.currency}</span>}
                            {parsed.amountValue != null && (
                                <span className="rounded border border-white/10 px-2 py-[2px] text-white/70">
                                    amount:{parsed.amountOp || "="}{parsed.amountValue}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="max-h-[50vh] sm:max-h-[60vh] overflow-auto">
                        {loading && <div className="p-4 text-sm text-white/60">Buscando…</div>}
                        {!loading && results.length === 0 && !!query.trim() && (
                            <div className="p-4 text-sm text-white/60">Nada encontrado para “{query}”.</div>
                        )}
                        {!loading && results.length > 0 && (
                            <ul className="divide-y divide-white/10">
                                {results.map((r, idx) => {
                                    const icon = r.icon_url || fallbackIcon(r.type, r.source || undefined);
                                    const device = r.user_agent ? parseUA(r.user_agent) : liveUA;
                                    const active = idx === activeIdx;
                                    return (
                                        <li key={`sug-${r.id}`}>
                                            <button
                                                onMouseEnter={() => setActiveIdx(idx)}
                                                onClick={() => onPick({ kind: "id", id: r.id, display: formatIdTag(r.id), activity: r })}
                                                className={`w-full text-left px-4 py-3 transition flex items-center gap-3 ${active ? "bg-white/10" : "hover:bg-white/5"}`}
                                            >
                                                <img src={icon} alt={r.type} className="h-8 w-8 rounded-full object-cover" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                                        <span className="font-medium text-white/90">{r.type}</span>
                                                        <SafeStatus value={r.status} />
                                                        {r.source && <span className="text-[11px] text-white/60 border border-white/10 rounded px-1.5 py-[1px]">{r.source}</span>}
                                                        <span className="text-[11px] text-white/40">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                                                    </div>
                                                    <div className="text-white/70 text-sm truncate">{r.description || "—"}</div>
                                                    <div className="text-[11px] text-white/40 mt-0.5">{device.browser} · {device.os} · {r.ip || "—"}</div>
                                                </div>
                                                <div className="text-white/60 text-sm">{formatAmount(r.amount_cents, r.currency)}</div>
                                                <span className="ml-3 rounded border border-white/10 px-2 py-[2px] text-[11px] text-white/70">
                                                    {formatIdTag(r.id)}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <div className="p-3 border-t border-white/10 text-right">
                        <button
                            onClick={() => {
                                const trimmed = query.trim();
                                if (activeIdx >= 0 && activeIdx < results.length) {
                                    const r = results[activeIdx];
                                    onPick({ kind: "id", id: r.id, display: formatIdTag(r.id), activity: r });
                                } else if (trimmed) {
                                    onPick({ kind: "query", query: trimmed });
                                } else {
                                    onPick({ kind: "query", query: "" }); // ⬅️ botão “Pesquisar” com vazio => limpar busca
                                }
                            }}
                            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5"
                        >
                            Pesquisar
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

/* ---------------- Skeleton (3 cards com shimmer) ---------------- */
function SkeletonCard() {
    return (
        <div className="relative h-[104px] rounded-xl border border-white/10 bg-[#0b0b0b] overflow-hidden p-3">
            <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-full bg-white/5" />
                <div className="flex-1 min-w-0">
                    <div className="h-4 w-40 rounded bg-white/5" />
                    <div className="mt-2 h-3 w-3/5 rounded bg-white/5" />
                    <div className="mt-3 flex items-center justify-between">
                        <div className="h-3 w-24 rounded bg-white/5" />
                        <div className="h-3 w-32 rounded bg-white/5" />
                    </div>
                </div>
            </div>

            {/* shimmer */}
            <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0) 100%)",
                    backgroundSize: "200% 100%",
                }}
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
        </div>
    );
}

/* ---------------- Variants ---------------- */
const listVariants = {
    initial: {},
    animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
    exit: { transition: { staggerChildren: 0.04, staggerDirection: -1 } },
};

const cardVariants: Variants = {
    initial: { opacity: 0, y: 18, scale: 0.98, filter: "blur(6px)" as any },
    animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)" as any,
        transition: { type: "spring", stiffness: 420, damping: 30, mass: 0.6 },
    },
    exit: {
        opacity: 0,
        y: -8,
        scale: 0.98,
        filter: "blur(2px)" as any,
        transition: { duration: 0.18 },
    },
};

/* ---------------- Main Component ---------------- */
export default function RecentActivitiesMain({ userName, userEmail }: Props) {
    useAuth();

    const displayName = userName.length > 25 ? userName.slice(0, 25) + "..." : userName;
    const prefersReducedMotion = useReducedMotion();

    // filtros / paginação
    const [page, setPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(20);
    const [type, setType] = React.useState("");
    const [status, setStatus] = React.useState("");
    const [source, setSource] = React.useState("");
    const [q, setQ] = React.useState("");
    const [selectedId, setSelectedId] = React.useState<number | null>(null);
    const [selectedActivity, setSelectedActivity] = React.useState<Activity | null>(null);
    const [from, setFrom] = React.useState("");
    const [to, setTo] = React.useState("");
    const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);

    // expansão por id
    const [expanded, setExpanded] = React.useState<Record<number, boolean>>({});
    const toggleExpanded = (id: number) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

    // debounce da busca digitada
    const [qDebounced, setQDebounced] = React.useState(q);
    React.useEffect(() => {
        const t = setTimeout(() => setQDebounced(q), 260);
        return () => clearTimeout(t);
    }, [q]);

    // overlay de busca (Ctrl+K)
    const [aiOpen, setAiOpen] = React.useState(false);
    useKey("k", () => setAiOpen(true));

    // realtime / util
    const [unseen, setUnseen] = React.useState(0);
    const esRef = React.useRef<EventSource | null>(null);
    const pageRef = React.useRef(page);
    const pageSizeRef = React.useRef(pageSize);
    const seenIdsRef = React.useRef<Set<number>>(new Set());
    const liveUA = useLiveUA();

    React.useEffect(() => { pageRef.current = page; }, [page]);
    React.useEffect(() => { pageSizeRef.current = pageSize; }, [pageSize]);

    // dados
    const [items, setItems] = React.useState<Activity[]>([]);
    const [total, setTotal] = React.useState(0);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    function buildQueryParams() {
        const params = new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize),
        });
        if (selectedId != null) {
            params.set("id", String(selectedId)); // se o backend suportar
            params.set("q", formatIdTag(selectedId)); // fallback textual
        } else if (qDebounced) {
            params.set("q", qDebounced);
        }
        if (type) params.set("type", type);
        if (status) params.set("status", status);
        if (source) params.set("source", source);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        return params;
    }

    async function fetchActivities(opts?: { signal?: AbortSignal }) {
        setLoading(true);
        setError(null);
        try {
            const params = buildQueryParams();
            const res = await fetch(`/api/recent-activities?${params.toString()}`, {
                credentials: "include",
                signal: opts?.signal,
                cache: "no-store",
            });
            if (!res.ok) throw new Error(`Falha ao carregar: ${res.status} Tente novamente.`);
            const json = await res.json();
            const list: Activity[] = Array.isArray(json.items) ? json.items : [];
            setTotal(Number(json.total || 0));
            setItems(list);
            const nextSeen = new Set<number>(seenIdsRef.current);
            for (const r of list) if (typeof r.id === "number") nextSeen.add(r.id);
            seenIdsRef.current = nextSeen;
        } catch (err: any) {
            if (err?.name !== "AbortError") setError(err?.message || "Erro ao carregar atividades");
        } finally {
            setLoading(false);
        }
    }

    // fetch quando filtros mudam
    React.useEffect(() => {
        const ctrl = new AbortController();
        fetchActivities({ signal: ctrl.signal as AbortSignal });
        return () => ctrl.abort();
    }, [page, pageSize, type, status, source, qDebounced, selectedId, from, to]);

    // SSE conectando pelos filtros (sem página)
    React.useEffect(() => {
        if (esRef.current) { esRef.current.close(); esRef.current = null; }

        const sp = new URLSearchParams();
        if (selectedId != null) {
            sp.set("id", String(selectedId));
            sp.set("q", formatIdTag(selectedId));
        } else if (qDebounced) sp.set("q", qDebounced);
        if (type) sp.set("type", type);
        if (status) sp.set("status", status);
        if (source) sp.set("source", source);
        if (from) sp.set("from", from);
        if (to) sp.set("to", to);
        sp.set("since", String(Date.now()));

        const es = new EventSource(`/api/recent-activities/stream?${sp.toString()}`, { withCredentials: true });
        esRef.current = es;

        es.addEventListener("message", (ev) => {
            try {
                const activity = JSON.parse(ev.data) as Activity;
                const idNum = Number(activity?.id);
                if (!Number.isFinite(idNum)) return;
                if (seenIdsRef.current.has(idNum)) return;
                seenIdsRef.current.add(idNum);
                if (selectedId != null && idNum !== selectedId) return;

                if (pageRef.current === 1) {
                    setItems((prev) => {
                        const next = [activity, ...prev];
                        return next.slice(0, pageSizeRef.current);
                    });
                } else {
                    setUnseen((u) => u + 1);
                }
                setTotal((t) => t + 1);
            } catch { }
        });

        es.addEventListener("heartbeat", () => { });
        es.onerror = () => { es.close(); };

        return () => { es.close(); esRef.current = null; };
    }, [type, status, source, qDebounced, selectedId, from, to]);

    function copyIp(ip?: string | null) {
        if (!ip) return;
        try { navigator.clipboard.writeText(ip); } catch { }
    }

    const effectiveQuery = selectedId != null ? formatIdTag(selectedId) : qDebounced;

    let displayedItems = React.useMemo(
        () => smartFilterAndRank(items, effectiveQuery),
        [items, effectiveQuery]
    );

    if (selectedId != null && selectedActivity && !displayedItems.some((a) => a.id === selectedActivity.id)) {
        displayedItems = [selectedActivity, ...displayedItems];
    }

    const isMobile = useIsMobile();

    // ⬅️ helper para centralizar “limpar busca”
    const clearSearch = React.useCallback(() => {
        setSelectedId(null);
        setSelectedActivity(null);
        setQ("");
        setPage(1);
    }, []);

    /* ---------------- UI ---------------- */
    return (
        <SidebarProvider
            style={
                {
                    "--sidebar-width": "calc(var(--spacing) * 72)",
                    "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
            }
        >
            <AppSidebar variant="inset" userName={displayName} userEmail={userEmail} />

            <SidebarInset>
                <SiteHeader />

                <div className="flex flex-1 flex-col">
                    <div className="@container/main flex flex-1 flex-col gap-2">
                        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 max-w-[90rem] lg:mx-auto lg:w-full lg:px-0">
                            {/* Cabeçalho + filtros (mobile-first) */}
                            <div className="px-4 lg:px-6 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-base sm:text-lg font-semibold text-white/90">Atividades recentes</h2>
                                    {unseen > 0 && page !== 1 && (
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs sm:text-sm text-emerald-200 hover:bg-emerald-500/20"
                                            onClick={() => { setPage(1); setUnseen(0); }}
                                        >
                                            Mostrar {unseen} novas
                                        </motion.button>
                                    )}
                                </div>

                                {/* Linha 1: campo de busca + botão filtros no mobile */}
                                <div className="flex gap-2">
                                    <div className="w-full relative">
                                        <button
                                            onClick={() => setAiOpen(true)}
                                            className="w-full rounded-md bg-[#0a0a0a] border border-white/10 px-3 sm:px-4 py-3 sm:py-4 text-sm text-white/60 hover:bg-white/5 transition flex items-center justify-between"
                                        >
                                            <span className={effectiveQuery ? "text-white/90 truncate" : "text-white/40"}>
                                                {effectiveQuery || "Busque pelas suas atividades aqui"}
                                            </span>

                                            {/* ⬅️ Direita do “input” centralizado: se houver busca ativa, mostra X; senão mostra “Ctrl + K” */}
                                            {(selectedId != null || !!effectiveQuery) ? (
                                                <span
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-[7px] border border-white/10 text-xs text-white/70 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/20"
                                                    title="Limpar busca"
                                                    onClick={(e) => { e.stopPropagation(); clearSearch(); }} // ⬅️ não abre o modal
                                                >
                                                    ×
                                                </span>
                                            ) : (
                                                <span className="hidden sm:inline text-[11px] text-white/40 border border-white/10 rounded px-2 py-[2px]">
                                                    Ctrl + K
                                                </span>
                                            )}
                                        </button>

                                        {selectedId != null && (
                                            <div className="mt-1">
                                                <button
                                                    onClick={() => { clearSearch(); }}
                                                    className="text-[11px] text-white/60 hover:text-white/80"
                                                >
                                                    Limpar filtro por ID
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => setMobileFiltersOpen(v => !v)}
                                        className="hidden max-[1249px]:inline-flex items-center justify-center rounded-md border border-white/10 bg-[#0a0a0a] px-3 sm:px-4 py-3 sm:py-4 text-sm font-medium text-white/80 hover:bg-white/5 transition whitespace-nowrap"
                                        aria-expanded={mobileFiltersOpen}
                                        aria-controls="mobile-filters"
                                        title="Filtros"
                                    >
                                        Filtros
                                    </button>
                                </div>

                                {/* Filtros colapsáveis no mobile; lado a lado no desktop */}
                                <div
                                    id="mobile-filters"
                                    aria-hidden={isMobile ? !mobileFiltersOpen : false}
                                    data-open={isMobile ? (mobileFiltersOpen ? "true" : "false") : "true"}
                                    className={[
                                        "grid grid-cols-2 gap-2 transition-all",
                                        mobileFiltersOpen
                                            ? "max-h-[320px] opacity-100"
                                            : "max-h-0 opacity-0 pointer-events-none",
                                        "min-[1250px]:grid min-[1250px]:grid-cols-5 min-[1250px]:gap-2",
                                        "min-[1250px]:max-h-none min-[1250px]:opacity-100 min-[1250px]:pointer-events-auto min-[1250px]:transition-none",
                                    ].join(" ")}
                                >
                                    <MenuSelect
                                        value={type}
                                        onChange={(v) => { setPage(1); setType(v); }}
                                        placeholder="Tipo (todos)"
                                        options={[
                                            { value: "", label: "Tipo (todos)" },
                                            { value: "login", label: "login" },
                                            { value: "payment.created", label: "payment.created" },
                                            { value: "payment.captured", label: "payment.captured" },
                                            { value: "refund", label: "refund" },
                                            { value: "kyc.updated", label: "kyc.updated" },
                                            { value: "webhook.error", label: "webhook.error" },
                                        ]}
                                    />
                                    <MenuSelect
                                        value={status}
                                        onChange={(v) => { setPage(1); setStatus(v); }}
                                        placeholder="Status (todos)"
                                        options={[
                                            { value: "", label: "Status (todos)" },
                                            { value: "success", label: "success" },
                                            { value: "failed", label: "failed" },
                                            { value: "pending", label: "pending" },
                                        ]}
                                    />
                                    <MenuSelect
                                        value={source}
                                        onChange={(v) => { setPage(1); setSource(v); }}
                                        placeholder="Origem (todas)"
                                        options={[
                                            { value: "", label: "Origem (todas)" },
                                            { value: "api", label: "api" },
                                            { value: "dashboard", label: "dashboard" },
                                            { value: "webhook", label: "webhook" },
                                            { value: "system", label: "system" },
                                        ]}
                                    />
                                    <input
                                        type="date"
                                        className="rounded-md bg-[#0a0a0a] border border-white/10 px-3 py-3 text-sm"
                                        value={from}
                                        onChange={(e) => { setPage(1); setFrom(e.target.value); }}
                                    />
                                    <input
                                        type="date"
                                        className="rounded-md bg-[#0a0a0a] border border-white/10 px-3 py-3 text-sm"
                                        value={to}
                                        onChange={(e) => { setPage(1); setTo(e.target.value); }}
                                    />
                                </div>
                            </div>

                            {/* Lista em CARDS */}
                            <div className="px-4 lg:px-6">
                                {loading && (
                                    <div className="space-y-2">
                                        {[0, 1, 2].map((i) => <SkeletonCard key={`sk-${i}`} />)}
                                    </div>
                                )}

                                {!loading && error && (
                                    <div className="p-4 text-sm">
                                        <div className="mb-2 text-red-400">Erro: {error}</div>
                                        <button
                                            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5"
                                            onClick={() => {
                                                const ctrl = new AbortController();
                                                fetchActivities({ signal: ctrl.signal as AbortSignal });
                                            }}
                                        >
                                            Tentar novamente
                                        </button>
                                    </div>
                                )}

                                {!loading && !error && displayedItems.length === 0 && (
                                    <div className="py-16">
                                        <div className="flex flex-col items-center justify-center text-center">
                                            <img src="https://www.wyzebank.com/error_image.png" alt="" className="h-70 text-white/30" />

                                            {/* texto embaixo */}
                                            <p className="mt-3 text-[17px] text-white/30 fonte-medium user-none">
                                                Nenhuma atividade encontrada.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {!loading && !error && displayedItems.length > 0 && (
                                    <LayoutGroup id="activities">
                                        <motion.ul
                                            layout
                                            variants={listVariants}
                                            initial="initial"
                                            animate="animate"
                                            exit="exit"
                                            className="space-y-2"
                                        >
                                            <AnimatePresence initial={false}>
                                                {displayedItems.map((it) => {
                                                    const icon = it.icon_url || fallbackIcon(it.type, it.source || undefined);
                                                    const device = it.user_agent ? parseUA(it.user_agent) : liveUA;
                                                    const open = !!expanded[it.id];

                                                    return (
                                                        <motion.li
                                                            key={it.id}
                                                            layout
                                                            layoutId={`card-${it.id}`}
                                                            variants={prefersReducedMotion ? undefined : (cardVariants as any)}
                                                            initial="initial"
                                                            animate="animate"
                                                            exit="exit"
                                                            whileHover={{ y: -2 }}
                                                            whileTap={{ scale: 0.995 }}
                                                            viewport={{ once: true, margin: "-80px" }}
                                                            className="group rounded-xl border border-white/10 bg-[#0b0b0b] p-3 hover:border-white/20 hover:bg-[#0c0c0c] transition will-change-transform will-change-[filter,transform,opacity]"
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                {/* Avatar */}
                                                                <motion.div
                                                                    className="relative shrink-0"
                                                                    whileHover={{ y: -1 }}
                                                                    transition={{ type: "spring", stiffness: 400, damping: 26 }}
                                                                >
                                                                    <img src={icon} alt={it.type} className="h-12 w-12 rounded-full object-cover" />
                                                                    {it.status === "success" && (
                                                                        <motion.span
                                                                            className="pointer-events-none absolute inset-0 rounded-full border border-emerald-400/30"
                                                                            initial={{ scale: 1, opacity: 0.35 }}
                                                                            animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0, 0.35] }}
                                                                            transition={{ duration: 1.6, repeat: Infinity }}
                                                                        />
                                                                    )}
                                                                </motion.div>

                                                                {/* Conteúdo */}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <span className="font-medium text-white/90">{it.type}</span>
                                                                        <SafeStatus value={it.status} />
                                                                        {it.source && (
                                                                            <span className="text-[11px] text-white/60 rounded-md border border-white/10 px-2 py-[2px]">
                                                                                {it.source}
                                                                            </span>
                                                                        )}
                                                                        <span className="text-[11px] text-white/40">
                                                                            {new Date(it.created_at).toLocaleString("pt-BR")}
                                                                        </span>
                                                                    </div>

                                                                    <div className="mt-1 text-sm text-white/80">
                                                                        {it.description || "—"}
                                                                    </div>

                                                                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                                                                        <div className="text-white/80 text-sm">
                                                                            {formatAmount(it.amount_cents, it.currency)}
                                                                        </div>
                                                                        <div className="flex items-center gap-3 text-[12px] text-white/60">
                                                                            <button
                                                                                onClick={() => copyIp(it.ip)}
                                                                                title={it.ip ? `Copiar IP ${it.ip}` : "Sem IP"}
                                                                                className="hover:text-white/80 transition"
                                                                            >
                                                                                {it.ip || "—"}
                                                                            </button>
                                                                            <span className="text-white/30">·</span>
                                                                            <span title={it.user_agent || ""}>{device.browser} · {device.os}</span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Detalhes avançados */}
                                                                    <div className="mt-2">
                                                                        <button
                                                                            onClick={() => toggleExpanded(it.id)}
                                                                            className="text-[12px] text-white/60 hover:text-white/80 transition inline-flex items-center gap-1"
                                                                        >
                                                                            <svg width="14" height="14" viewBox="0 0 20 20" className={`${open ? "rotate-180" : ""} transition`}>
                                                                                <path fill="currentColor" d="M5 8l5 5l5-5H5z" />
                                                                            </svg>
                                                                            Detalhes
                                                                        </button>
                                                                        <AnimatePresence initial={false}>
                                                                            {open && (
                                                                                <motion.div
                                                                                    layout
                                                                                    key={`details-${it.id}`}
                                                                                    initial={{ height: 0, opacity: 0, filter: "blur(4px)" as any }}
                                                                                    animate={{ height: "auto", opacity: 1, filter: "blur(0px)" as any }}
                                                                                    exit={{ height: 0, opacity: 0, filter: "blur(3px)" as any }}
                                                                                    transition={{ type: "spring", stiffness: 360, damping: 32 }}
                                                                                    className="overflow-hidden"
                                                                                >
                                                                                    <div className="mt-2 rounded-lg border border-white/10 bg-black/10 p-3 text-[12px] text-white/70 grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                                        {/* Identificação */}
                                                                                        <div><span className="text-white/50">ID:</span> {it.id} <span className="text-white/40">({formatIdTag(it.id)})</span></div>
                                                                                        <div className="truncate"><span className="text-white/50">Request:</span> <Copyable text={it.request_id}>{maskId(it.request_id)}</Copyable></div>
                                                                                        <div className="truncate"><span className="text-white/50">Correlation:</span> <Copyable text={it.correlation_id}>{maskId(it.correlation_id)}</Copyable></div>
                                                                                        <div className="truncate"><span className="text-white/50">Session:</span> <Copyable text={it.session_id}>{maskId(it.session_id)}</Copyable></div>
                                                                                        <div className="truncate"><span className="text-white/50">Device:</span> <Copyable text={it.device_id}>{maskId(it.device_id)}</Copyable></div>

                                                                                        {/* Segurança & risco */}
                                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                                            <span className="text-white/50">KYC:</span> <Badge>{it.kyc_level || "—"}</Badge>
                                                                                            <RiskPill score={it.risk_score} />

                                                                                            {(() => {
                                                                                                const flags = Array.isArray(it.risk_flags) ? it.risk_flags as string[] : [];
                                                                                                if (flags.length === 0) return null;
                                                                                                return (
                                                                                                    <div className="flex flex-wrap gap-1">
                                                                                                        {flags.slice(0, 4).map((f) => (
                                                                                                            <Badge key={f}>{f}</Badge>
                                                                                                        ))}
                                                                                                        {flags.length > 4 && <Badge>+{flags.length - 4}</Badge>}
                                                                                                    </div>
                                                                                                );
                                                                                            })()}
                                                                                        </div>


                                                                                        {/* Origem & ambiente */}
                                                                                        <div className="truncate">
                                                                                            <span className="text-white/50">Ambiente:</span>{" "}
                                                                                            <Badge className={
                                                                                                it.environment === "prod" ? "border-red-400/40 text-red-300 bg-red-500/10"
                                                                                                    : it.environment === "sandbox" ? "border-yellow-400/40 text-yellow-200 bg-yellow-500/10"
                                                                                                        : "border-white/15 text-white/80"
                                                                                            }>
                                                                                                {it.environment || "—"}
                                                                                            </Badge>
                                                                                        </div>
                                                                                        <div className="truncate"><span className="text-white/50">Origem:</span> {it.source || "—"}</div>

                                                                                        {/* Localização */}
                                                                                        <div className="truncate"><span className="text-white/50">IP:</span> <Copyable text={it.ip}>{it.ip || "—"}</Copyable></div>
                                                                                        <div className="truncate">
                                                                                            <span className="text-white/50">Geo:</span>{" "}
                                                                                            {[
                                                                                                it.location?.city,
                                                                                                it.location?.region,
                                                                                                it.location?.country
                                                                                            ].filter(Boolean).join(" · ") || "—"}
                                                                                            {it.location?.asn ? ` · ASN ${it.location.asn}` : ""}
                                                                                        </div>

                                                                                        {/* Navegador & SO */}
                                                                                        <div className="truncate">
                                                                                            <span className="text-white/50">Navegador:</span>{" "}
                                                                                            {(it.user_agent ? parseUA(it.user_agent) : liveUA).browser || "—"}
                                                                                        </div>
                                                                                        <div className="truncate">
                                                                                            <span className="text-white/50">SO:</span>{" "}
                                                                                            {(it.user_agent ? parseUA(it.user_agent) : liveUA).os || "—"}
                                                                                        </div>
                                                                                        <div className="truncate"><span className="text-white/50">User-Agent:</span> <Copyable text={it.user_agent}>{it.user_agent || "—"}</Copyable></div>

                                                                                        {/* HTTP & performance */}
                                                                                        <div className="truncate">
                                                                                            <span className="text-white/50">HTTP:</span>{" "}
                                                                                            {[it.http?.method, it.http?.path].filter(Boolean).join(" ") || "—"}
                                                                                        </div>
                                                                                        <div className="truncate"><span className="text-white/50">Status:</span> {it.http?.status ?? "—"}</div>
                                                                                        <div className="truncate"><span className="text-white/50">Latency:</span> {typeof it.http?.latency_ms === "number" ? `${it.http?.latency_ms} ms` : "—"}</div>
                                                                                        <div className="truncate"><span className="text-white/50">Idempotency-Key:</span> <Copyable text={it.http?.idempotency_key}>{maskId(it.http?.idempotency_key)}</Copyable></div>

                                                                                        {/* TLS */}
                                                                                        <div className="truncate">
                                                                                            <span className="text-white/50">TLS:</span>{" "}
                                                                                            {[it.tls?.version, it.tls?.cipher].filter(Boolean).join(" · ") || "—"}
                                                                                        </div>

                                                                                        {/* Pagamento */}
                                                                                        <div className="truncate">
                                                                                            <span className="text-white/50">Cartão:</span>{" "}
                                                                                            {[
                                                                                                it.payment?.card_brand,
                                                                                                it.payment?.card_last4 ? `•••• ${it.payment?.card_last4}` : null
                                                                                            ].filter(Boolean).join(" · ") || "—"}
                                                                                        </div>
                                                                                        <div className="truncate"><span className="text-white/50">Parcelas:</span> {it.payment?.installment_count ?? "—"}</div>
                                                                                        <div className="truncate">
                                                                                            <span className="text-white/50">Gateway:</span>{" "}
                                                                                            {it.payment?.gateway_code || "—"}
                                                                                            {it.payment?.chargeback ? " · chargeback" : ""}
                                                                                        </div>

                                                                                        {/* Webhook */}
                                                                                        <div className="truncate">
                                                                                            <span className="text-white/50">Webhook:</span>{" "}
                                                                                            {it.webhook?.attempts != null ? `${it.webhook.attempts} tentativa(s)` : "—"}
                                                                                            {it.webhook?.last_status ? ` · ${it.webhook.last_status}` : ""}
                                                                                        </div>

                                                                                        {/* Identidades */}
                                                                                        <div className="truncate"><span className="text-white/50">Cliente:</span> <Copyable text={it.customer_id}>{maskId(it.customer_id)}</Copyable></div>
                                                                                        <div className="truncate"><span className="text-white/50">Estabelecimento:</span> <Copyable text={it.merchant_id}>{maskId(it.merchant_id)}</Copyable></div>

                                                                                        {/* Datas */}
                                                                                        <div className="truncate"><span className="text-white/50">Criado:</span> {new Date(it.created_at).toLocaleString("pt-BR")}</div>
                                                                                        <div className="truncate"><span className="text-white/50">ISO:</span> {new Date(it.created_at).toISOString()}</div>
                                                                                    </div>
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </motion.li>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </motion.ul>
                                    </LayoutGroup>
                                )}

                                {/* Paginação */}
                                <div className="mt-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <motion.button
                                            whileTap={{ scale: 0.98 }}
                                            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40"
                                            disabled={page <= 1 || loading}
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        >
                                            Anterior
                                        </motion.button>
                                        <motion.button
                                            whileTap={{ scale: 0.98 }}
                                            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40"
                                            disabled={page * pageSize >= total || loading}
                                            onClick={() => setPage((p) => p + 1)}
                                        >
                                            Próxima
                                        </motion.button>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs text-white/50">
                                        <span>Página {page}</span>
                                        <MenuSelect
                                            value={String(pageSize)}
                                            onChange={(v) => { setPage(1); setPageSize(Number(v) || 20); }}
                                            placeholder={`${pageSize}/página`}
                                            options={[10, 20, 50, 100].map((n) => ({ value: String(n), label: `${n}/página` }))}
                                            className="w-[140px]"
                                            placement="top"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <AIPalette
                    open={aiOpen}
                    onClose={() => setAiOpen(false)}
                    defaultQuery={q}
                    onPick={(choice) => {
                        setAiOpen(false);
                        setPage(1);
                        if (choice.kind === "id") {
                            setSelectedId(choice.id);
                            setSelectedActivity(choice.activity ?? null);
                        } else {
                            // ⬅️ se vier query vazia, limpa globalmente
                            if (choice.query.trim() === "") {
                                clearSearch();
                            } else {
                                setSelectedId(null);
                                setSelectedActivity(null);
                                setQ(choice.query);
                            }
                        }
                    }}
                />
            </SidebarInset>
        </SidebarProvider>
    );
}

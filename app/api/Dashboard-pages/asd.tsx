app/api/Dashboard-pages/RecentActivitiesMain.tsx

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
  if (amount_cents == null) return "Não há informações";
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
      onClick={(e) => { e.stopPropagation(); if (canCopy) try { navigator.clipboard.writeText(val); } catch { } }}
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
  if (!id) return "Não há informações";
  const s = id.toString();
  if (s.length <= 8) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function RiskPill({ score }: { score?: number | null }) {
  if (score == null) return <Badge>risk: Não há informações</Badge>;
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
  const [info, setInfo] = React.useState<UAInfo>({ browser: "Não há informações", os: "Não há informações", version: "" });

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

/* ---------------- Query intelligence (FUZZY) ---------------- */

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

const normalizeLoose = (s: string) =>
  normalize(s).replace(/[^a-z0-9#]/g, " ").replace(/\s+/g, " ").trim();

const stripPunct = (s: string) => normalize(s).replace(/[^a-z0-9]/g, "");

const formatIdTag = (id: number) => `#${String(id).padStart(8, "0")}`;
const parseIdTag = (s: string): number | null => {
  const m = s.trim().match(/^#\s*0*(\d+)$/i);
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

/* ---- fuzzy core: Levenshtein ---- */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1,      // deletion
        dp[j - 1] + 1,  // insertion
        prev + cost     // substitution
      );
      prev = temp;
    }
  }
  return dp[n];
}

function within(a: string, b: string, max: number) {
  return levenshtein(stripPunct(a), stripPunct(b)) <= max;
}

function fuzzyThreshold(word: string) {
  const len = stripPunct(word).length;
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

function bestClosest(word: string, candidates: string[]): { key?: string; dist: number } {
  const w = stripPunct(word);
  let best: string | undefined;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(w, stripPunct(c));
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return { key: best, dist: bestDist };
}

/* ---- aliases / sinônimos ---- */
const STATUS_CANON = ["success", "failed", "pending"];
const STATUS_ALIASES: Record<string, string[]> = {
  success: ["success", "sucesso", "aprovado", "ok", "succeeded", "completed", "captured"],
  failed: ["failed", "falha", "falhou", "erro", "error", "recusado", "declined", "denied"],
  pending: ["pending", "pendente", "aguardando", "processing", "em analise", "em_analise", "review"],
};

const SOURCE_CANON = ["api", "dashboard", "webhook", "system"];
const SOURCE_ALIASES: Record<string, string[]> = {
  api: ["api"],
  dashboard: ["dashboard", "painel", "admin", "console"],
  webhook: ["webhook", "web hook", "webook", "weebhook", "hook"],
  system: ["system", "sistema", "interno"],
};

const TYPE_HINTS = [
  "payment", "payment.created", "payment.captured", "refund", "login", "kyc", "kyc.updated", "webhook"
];
const TYPE_ALIASES: Record<string, string[]> = {
  payment: ["payment", "pagamento", "paymant", "peyment"],
  "payment.created": ["payment.created", "pagamento.criado", "payment created", "payment-create"],
  "payment.captured": ["payment.captured", "captura", "captured", "pagamento.capturado"],
  refund: ["refund", "reembolso", "estorno"],
  login: ["login", "log in", "signin", "sign in", "autenticacao"],
  kyc: ["kyc", "verificacao", "verificacao de identidade"],
  "kyc.updated": ["kyc.updated", "kyc atualizado", "atualizacao kyc"],
  webhook: ["webhook", "web hook", "webook"],
};

const KEY_CANON = ["type", "tipo", "event", "evento", "status", "estado", "source", "origem", "currency", "moeda", "amount", "valor", "value", "id", "codigo"];
const CURRENCY_ALIASES: Record<string, string> = {
  brl: "BRL", real: "BRL", reais: "BRL", "r$": "BRL", "brazilianreal": "BRL",
  usd: "USD", dolar: "USD", "dolaramericano": "USD", dollar: "USD", "$": "USD",
  eur: "EUR", euro: "EUR", "€": "EUR",
};

/* ---- resolvers ---- */
function resolveStatusAlias(s: string): string | undefined {
  const all = Object.entries(STATUS_ALIASES);
  const n = normalize(s);
  for (const [canon, arr] of all) {
    for (const a of arr) {
      if (normalize(a) === n) return canon;
      const th = fuzzyThreshold(a);
      if (within(a, n, th)) return canon;
    }
  }
  const { key, dist } = bestClosest(n, STATUS_CANON);
  if (key && dist <= 2) return key;
  return undefined;
}

function resolveSourceAlias(s: string): string | undefined {
  const all = Object.entries(SOURCE_ALIASES);
  const n = normalize(s);
  for (const [canon, arr] of all) {
    for (const a of arr) {
      if (normalize(a) === n) return canon;
      const th = fuzzyThreshold(a);
      if (within(a, n, th)) return canon;
    }
  }
  const { key, dist } = bestClosest(n, SOURCE_CANON);
  if (key && dist <= 2) return key;
  return undefined;
}

function resolveTypeAlias(s: string): string | undefined {
  const n = normalize(s);
  for (const [canon, arr] of Object.entries(TYPE_ALIASES)) {
    for (const a of arr) {
      if (normalize(a) === n) return canon;
      const th = fuzzyThreshold(a);
      if (within(a, n, th)) return canon;
    }
  }
  const { key, dist } = bestClosest(n, TYPE_HINTS);
  if (key && dist <= 2) return key;
  return undefined;
}

function resolveCurrency(s: string): string | undefined {
  const raw = s.toUpperCase().replace(/[^A-Z$€]|/g, "");
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  const n = normalize(s).replace(/\s+/g, "");
  if (n in CURRENCY_ALIASES) return CURRENCY_ALIASES[n];
  if (s.trim() === "$") return "USD";
  if (s.trim() === "€") return "EUR";
  if (s.trim().toUpperCase() === "R$") return "BRL";
  return undefined;
}

/* ---- fuzzy texto ---- */
function fuzzyIncludes(pool: string, term: string): boolean {
  const a = normalizeLoose(pool);
  const t = normalizeLoose(term);
  if (!t) return true;
  if (a.includes(t)) return true;
  const tokens = a.split(" ").filter(Boolean);
  const th = fuzzyThreshold(t);
  for (const tok of tokens) {
    if (tok.includes(t) || within(tok, t, th)) return true;
  }
  return false;
}

/* ---- IP helper ---- */
const IP_LIKE = /^(\d{1,3}\.){1,3}\d{0,3}$/; // parcial ou completo

/* ---- parser inteligente ---- */
function parseQuery(q: string): ParsedQuery {
  const raw = q || "";
  const parts = raw.split(/\s+/).filter(Boolean);

  const types: string[] = [];
  const statuses: string[] = [];
  const sources: string[] = [];
  const terms: string[] = [];

  let currency: string | undefined;
  let amountOp: ParsedQuery["amountOp"];
  let amountValue: number | undefined;
  let idEquals: number | null | undefined;

  const pushAmountIfBare = (token: string) => {
    if (amountValue != null) return;
    if (/^[\d.,]+$/.test(token) || /^r\$\s*[\d.,]+$/i.test(token)) {
      const num = parseMoneyToNumberBRorUS(token);
      if (num != null) { amountOp = amountOp || "="; amountValue = num; return true; }
    }
    return false;
  };

  for (let i = 0; i < parts.length; i++) {
    const tok = parts[i];
    const low = tok.toLowerCase();

    if (low.startsWith("#")) {
      const id = parseIdTag(tok.replace(/\s+/g, ""));
      if (id != null) { idEquals = id; continue; }
    }

    if (IP_LIKE.test(tok)) { terms.push(tok); continue; }

    if (tok.includes(":")) {
      const [kRaw, ...vArr] = tok.split(":");
      const vRaw = vArr.join(":");
      const kNorm = normalize(kRaw);
      const { key: closestKey, dist } = bestClosest(kNorm, KEY_CANON);
      const key = (closestKey && dist <= 2) ? closestKey : kNorm;

      if (["type", "tipo", "event", "evento"].includes(key)) {
        const v = resolveTypeAlias(vRaw) || vRaw;
        if (v) types.push(v);
        continue;
      }
      if (["status", "estado"].includes(key)) {
        const v = resolveStatusAlias(vRaw) || vRaw;
        if (v) statuses.push(v);
        continue;
      }
      if (["source", "origem"].includes(key)) {
        const v = resolveSourceAlias(vRaw) || vRaw;
        if (v) sources.push(v);
        continue;
      }
      if (["currency", "moeda"].includes(key)) {
        const v = resolveCurrency(vRaw);
        if (v) currency = v;
        continue;
      }
      if (["amount", "valor", "value"].includes(key)) {
        const m = vRaw.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
        if (m) {
          amountOp = (m[1] as any) || "=";
          const num = parseMoneyToNumberBRorUS(m[2]);
          if (num != null) amountValue = num;
        }
        continue;
      }
      if (["id", "codigo"].includes(key)) {
        const parsed = parseIdTag(`#${vRaw}`);
        if (parsed != null) idEquals = parsed;
        continue;
      }
      terms.push(tok);
      continue;
    }

    const maybeKey = bestClosest(normalize(tok), KEY_CANON);
    if (maybeKey.key && maybeKey.dist <= 1 && i + 1 < parts.length && !parts[i + 1].includes(":")) {
      const vRaw = parts[++i];
      if (["status", "estado"].includes(maybeKey.key)) {
        const v = resolveStatusAlias(vRaw) || vRaw;
        if (v) statuses.push(v);
        continue;
      }
      if (["type", "tipo", "event", "evento"].includes(maybeKey.key)) {
        const v = resolveTypeAlias(vRaw) || vRaw;
        if (v) types.push(v);
        continue;
      }
      if (["source", "origem"].includes(maybeKey.key)) {
        const v = resolveSourceAlias(vRaw) || vRaw;
        if (v) sources.push(v);
        continue;
      }
      if (["currency", "moeda"].includes(maybeKey.key)) {
        const v = resolveCurrency(vRaw);
        if (v) currency = v;
        continue;
      }
      if (["amount", "valor", "value"].includes(maybeKey.key)) {
        const num = parseMoneyToNumberBRorUS(vRaw);
        if (num != null) { amountOp = "="; amountValue = num; continue; }
      }
      terms.push(tok, vRaw);
      continue;
    }

    const cur = resolveCurrency(tok);
    if (cur) { currency = cur; continue; }

    const m2 = low.match(/^(>=|<=|>|<|=)\s*(.+)$/);
    if (m2) {
      amountOp = m2[1] as any;
      const num = parseMoneyToNumberBRorUS(m2[2]);
      if (num != null) { amountValue = num; continue; }
    }

    if (pushAmountIfBare(tok)) continue;

    const st = resolveStatusAlias(tok); if (st) { statuses.push(st); continue; }
    const so = resolveSourceAlias(tok); if (so) { sources.push(so); continue; }
    const tp = resolveTypeAlias(tok); if (tp) { types.push(tp); continue; }

    terms.push(tok);
  }

  return { raw, idEquals, types, statuses, sources, currency, amountOp, amountValue, terms };
}

/* ---- filtros/score com fuzziness ---- */
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
  const pool = [
    a.type,
    a.description || "",
    a.source || "",
    a.ip || "",
    a.user_agent || "",
    new Date(a.created_at).toLocaleString("pt-BR"),
    a.payment?.card_brand || "",
    a.payment?.gateway_code || "",
    a.customer_id || "",
    a.merchant_id || "",
  ].join(" ");
  return fuzzyIncludes(pool, term);
}

function typeMatches(a: Activity, types: string[]): boolean {
  if (!types.length) return true;
  const atype = a.type || "";
  return types.some((t) => {
    const tt = normalize(t);
    const pool = [atype, atype.split(".")[0]];
    return pool.some(p => fuzzyIncludes(p, tt));
  });
}

function statusMatches(a: Activity, statuses: string[]): boolean {
  if (!statuses.length) return true;
  const s = a.status || "";
  return statuses.some((t) => fuzzyIncludes(s, t));
}

function sourceMatches(a: Activity, sources: string[]): boolean {
  if (!sources.length) return true;
  const s = a.source || "";
  return sources.some((t) => fuzzyIncludes(s, t));
}

function currencyMatches(a: Activity, currency?: string): boolean {
  if (!currency) return true;
  return safeCurrency(a.currency) === currency.toUpperCase();
}

function scoreActivity(a: Activity, pq: ParsedQuery): number {
  let score = 0;
  if (pq.idEquals != null) score += a.id === pq.idEquals ? 999 : -999;

  for (const t of pq.types) {
    const exact = normalize(a.type) === normalize(t) || a.type?.startsWith(t);
    if (exact) score += 8;
    else if (typeMatches(a, [t])) score += 5;
  }

  if (amountMatches(a, pq.amountOp, pq.amountValue)) {
    if (pq.amountValue != null) score += 4;
  } else {
    score -= 6;
  }

  if (statusMatches(a, pq.statuses)) score += Math.min(6, pq.statuses.length * 2);
  if (sourceMatches(a, pq.sources)) score += Math.min(6, pq.sources.length * 2);
  if (currencyMatches(a, pq.currency)) score += pq.currency ? 3 : 0;

  for (const term of pq.terms) {
    if (textIncludesWhere(a, term)) score += Math.max(1, 4 - fuzzyThreshold(term));
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
        className="w-full rounded-md bg-[#050505] border border-white/10 px-3 py-3 text-sm text-white/90 hover:bg-white/5 transition flex items-center justify-between"
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
            className={`absolute z-20 ${placement === "top" ? "bottom-full mb-1" : "mt-1"} w-64 rounded-md border border-white/10 bg-[#050505] shadow-2xl backdrop-blur-sm overflow-hidden`}
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

/* --- helpers: colocar perto dos outros helpers --- */
const HASH_BREAK = "\u2060"; // caractere invisível (word-joiner)
const maskHashUI = (s: string) => (s ?? "").replace(/#/g, `#${HASH_BREAK}`);
const unmaskHashUI = (s: string) => (s ?? "").replace(new RegExp(HASH_BREAK, "g"), "");

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
          className="relative z-[61] w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#050505]/95 shadow-2xl"
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
                value={maskHashUI(query)}                               // 👈 exibe com máscara
                onChange={(e) => { setQuery(unmaskHashUI(e.target.value)); setActiveIdx(-1); }} // 👈 estado cru
                placeholder="Realize a busca de suas atividades aqui"
                className="w-full rounded-lg bg-[#050505] border border-white/10 px-4 py-4 text-sm outline-none focus:border-white/20 pr-10"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const trimmed = query.trim(); // 👈 usa o 'query' cru
                    if (trimmed === "") onPick({ kind: "query", query: "" });
                    else chooseByIdx(activeIdx);
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
                  onMouseDown={(e) => e.preventDefault()}     // 👈 não tira o foco do input
                  onClick={(e) => { e.stopPropagation(); setQuery(""); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-[7px] border border-white/10 text-xs text-white/70 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  <span aria-hidden className="leading-none">×</span>
                </button>
              )}
            </div>

            {/* Chips dos filtros compreendidos */}
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              {parsed.idEquals != null && <span className="rounded border border-white/10 px-2 py-[2px] text-white/70">id:{formatIdTag(parsed.idEquals)}</span>}
              {parsed.types.map((t, i) => <span key={`t-${t}-${i}`} className="rounded border border-white/10 px-2 py-[2px] text-white/70">type:{t}</span>)}
              {parsed.statuses.map((s, i) => <span key={`s-${s}-${i}`} className="rounded border border-white/10 px-2 py-[2px] text-white/70">status:{s}</span>)}
              {parsed.sources.map((s, i) => <span key={`so-${s}-${i}`} className="rounded border border-white/10 px-2 py-[2px] text-white/70">source:{s}</span>)}
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
                          <div className="text-white/70 text-sm truncate">{r.description || "Não há informações"}</div>
                          <div className="text:[11px] text-white/40">{device.browser} · {device.os} · {r.ip || "Não há informações"}</div>
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
    <div className="relative h-[104px] rounded-xl border border-white/10 bg-[#050505] overflow-hidden p-3">
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

/* -------------- SISTEMA DO PAINEL INFO COM ?at= (UUID-like) -------------- */
/** Token + armazenamento em sessão */
const AT_PREFIX = "wzb.at.";
type ATPayload = { id: number; activity: Activity; savedAt: number };

/** UUID v4 em formato dfa9da13-7fa7-4467-b7b1-61f1bba90092 */
function generateAT(): string {
  // usa nativo quando disponível (já retorna em minúsculas)
  const anyCrypto: any = typeof crypto !== "undefined" ? crypto : null;
  if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();

  // polyfill: 16 bytes aleatórios + bits de versão/variante
  const bytes = new Uint8Array(16);
  anyCrypto?.getRandomValues?.(bytes);
  // versão 4 (0b0100) no nibble alto do byte 6
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // variante RFC 4122 (10xxxxxx) no byte 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20)
  );
}

/** se já for UUID, mantém; senão, agrupa a cada 10 chars (legado) */
function groupATDisplay(at: string) {
  const s = (at || "").trim();
  const uuidRe = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  if (uuidRe.test(s)) return s.toLowerCase();
  return s.replace(/-/g, "").replace(/(.{10})/g, "$1-").replace(/-$/, "");
}

function saveAT(at: string, payload: ATPayload) {
  try {
    sessionStorage.setItem(AT_PREFIX + at, JSON.stringify(payload));
  } catch { }
}

function loadAT(at: string): ATPayload | null {
  try {
    const raw = sessionStorage.getItem(AT_PREFIX + at);
    if (!raw) return null;
    return JSON.parse(raw) as ATPayload;
  } catch {
    return null;
  }
}

function removeAT(at: string) {
  try {
    sessionStorage.removeItem(AT_PREFIX + at);
  } catch { }
}

/** Painel lateral de informações */
function InfoSheet({
  open,
  onClose,
  activity,
  atToken,
}: {
  open: boolean;
  onClose: () => void;
  activity: Activity | null;
  atToken: string | null;
}) {
  React.useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (open && e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const it = activity;
  return (
    <AnimatePresence>
      <motion.aside
        className="fixed inset-0 z-[80] flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* backdrop */}
        <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        {/* painel à direita */}
        <motion.div
          className="w-full max-w-[550px] h-full bg-[#050505] border-l border-white/10 shadow-2xl flex flex-col"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 34 }}
        >
          {/* header */}
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="min-w-0">
              <div className="text-xs text-white/40">Transferência de dinheiro</div>
              <div className="mt-1 flex items-center gap-2">
                <div className="text-lg font-semibold text-white/90 truncate">{it?.type || "Operação"}</div>
                <SafeStatus value={it?.status} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-xs text-white/40">Valor</div>
                <div className="text-base text-white/90 font-medium">{formatAmount(it?.amount_cents ?? null, it?.currency ?? "BRL")}</div>
              </div>
              <button
                title="Fechar"
                onClick={onClose}
                className="ml-2 grid h-8 w-8 place-items-center rounded-md border border-white/10 text-white/70 hover:bg-white/5"
              >
                ×
              </button>
            </div>
          </div>

          {/* barra com token */}
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3">
            <div className="text-xs text-white/50 truncate">
              <span className="text-white/40">AT:</span>{" "}
              <span className="font-mono text-white/80">{atToken ? groupATDisplay(atToken) : "Não há informações"}</span>
            </div>
            {atToken && (
              <button
                className="rounded-md border border-white/10 px-2 py-[6px] text-xs text-white/75 hover:bg-white/5"
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(atToken).catch(() => { }); }}
              >
                Copiar código
              </button>
            )}
          </div>

          {/* conteúdo rolável */}
          <div className="flex-1 overflow-auto p-5 space-y-4">
            {!it ? (
              <div className="text-sm text-white/60">
                Não conseguimos recuperar os dados deste atendimento. O código pode ter expirado. Tente abrir novamente pelo card.
              </div>
            ) : (
              <>
                {/* status + comprovante */}
                <section className="rounded-lg border border-white/10 bg-black/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                      <span className="text-sm text-white/80">
                        {it.status === "success" ? "Aprovada" : it.status === "failed" ? "Falhou" : "Pendente"}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); /* plugue seu link de comprovante aqui */ }}
                      className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5"
                    >
                      Ver comprovante
                    </button>
                  </div>
                </section>

                {/* meio de pagamento */}
                <section className="rounded-lg border border-white/10 bg-black/10 p-4 space-y-1">
                  <div className="text-xs text-white/40">Meio de pagamento</div>
                  <div className="text-sm text-white/80">
                    {it.payment?.gateway_code
                      ? `Saldo disponível via ${it.payment.gateway_code}`
                      : it.source
                        ? `Origem: ${it.source}`
                        : "Não há informações"}
                  </div>
                </section>

                {/* tipo de transferência */}
                <section className="rounded-lg border border-white/10 bg-black/10 p-4 space-y-1">
                  <div className="text-xs text-white/40">Tipo de transferência</div>
                  <div className="text-sm text-white/80">
                    {it.type?.startsWith("payment") ? "Pagamento" : it.type || "Não há informações"}
                    {safeCurrency(it.currency)}{it.currency ? "" : ""}
                  </div>
                </section>

                {/* para / de */}
                <section className="rounded-lg border border-white/10 bg-black/10 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-white/40">Para</div>
                    <div className="text-sm text-white/80">
                      {it.customer_id ? <Copyable text={it.customer_id}>{maskId(it.customer_id)}</Copyable> : "Não há informações"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Estabelecimento</div>
                    <div className="text-sm text-white/80">
                      {it.merchant_id ? <Copyable text={it.merchant_id}>{maskId(it.merchant_id)}</Copyable> : "Não há informações"}
                    </div>
                  </div>
                </section>

                {/* blocos adicionais */}
                <section className="rounded-lg border border-white/10 bg-black/10 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div><span className="text-white/50">ID:</span> {it.id}</div>
                  <div><span className="text-white/50">Criado:</span> {new Date(it.created_at).toLocaleString("pt-BR")}</div>
                  <div><span className="text-white/50">IP:</span> {it.ip || "Não há informações"}</div>
                  <div><span className="text-white/50">UA:</span> <Copyable text={it.user_agent}>{maskId(it.user_agent)}</Copyable></div>
                  <div><span className="text-white/50">KYC:</span> {it.kyc_level || "Não há informações"}</div>
                  <div><span className="text-white/50">Parcelas:</span> {it.payment?.installment_count ?? "Não há informações"}</div>
                  <div className="sm:col-span-2">
                    <span className="text-white/50">Descrição:</span>{" "}
                    <span className="text-white/80">{it.description || "Não há informações"}</span>
                  </div>
                </section>

                {/* ajuda */}
                <section className="rounded-lg border border-white/10 bg-black/10 p-4">
                  <div className="text-xs text-white/40 mb-2">Precisa de ajuda?</div>
                  <ul className="text-sm text-white/75 list-disc list-inside space-y-1">
                    <li>Pix não recebido ainda</li>
                    <li>Cancelar um Pix feito por engano</li>
                    <li>Denunciar golpe e pedir Pix de volta</li>
                  </ul>
                </section>
              </>
            )}
          </div>
        </motion.div>
      </motion.aside>
    </AnimatePresence>
  );
}

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

  function copyIp(ip?: string | null, e?: React.MouseEvent) {
    e?.stopPropagation();
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

  // helper para limpar busca + estado
  const clearSearch = React.useCallback(() => {
    setSelectedId(null);
    setSelectedActivity(null);
    setQ("");
    setPage(1);
  }, []);

  /* ---------------- Estados e lógica do Painel Info ---------------- */
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [infoAT, setInfoAT] = React.useState<string | null>(null);
  const [infoActivity, setInfoActivity] = React.useState<Activity | null>(null);

  const openInfoFor = React.useCallback((act: Activity) => {
    const at = generateAT(); // usa o default (50)
    saveAT(at, { id: act.id, activity: act, savedAt: Date.now() });
    const url = new URL(window.location.href);
    url.searchParams.set("at", at);
    window.history.pushState({ at }, "", url.toString());
    setInfoAT(at);
    setInfoActivity(act);
    setInfoOpen(true);
  }, []);

  const closeInfo = React.useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("at");
    window.history.pushState({}, "", url.toString());
    if (infoAT) removeAT(infoAT);
    setInfoAT(null);
    setInfoActivity(null);
    setInfoOpen(false);
  }, [infoAT]);

  // back/forward do navegador
  React.useEffect(() => {
    const handler = () => {
      const sp = new URLSearchParams(window.location.search);
      const at = sp.get("at");
      if (!at) {
        setInfoOpen(false);
        setInfoAT(null);
        setInfoActivity(null);
        return;
      }
      const loaded = loadAT(at);
      if (loaded?.activity) {
        setInfoAT(at);
        setInfoActivity(loaded.activity);
        setInfoOpen(true);
      } else {
        setInfoAT(at);
        setInfoActivity(null);
        setInfoOpen(true);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  // abrir pelo ?at= direto (refresh/entrada)
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const at = sp.get("at");
    if (!at) return;
    const payload = loadAT(at);
    if (payload?.activity) {
      setInfoAT(at);
      setInfoActivity(payload.activity);
      setInfoOpen(true);
    } else {
      setInfoAT(at);
      setInfoActivity(null);
      setInfoOpen(true);
    }
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
                  <h2 className="text-base sm:text-[20px] font-semibold text-white/90">Atividades recentes</h2>
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
                      type="button"
                      onClick={() => setAiOpen(true)}
                      className="w-full rounded-md bg-[#050505] border border-white/10 px-3 sm:px-4 py-3 sm:py-4 text-sm text-white/60 hover:bg-white/5 transition flex items-center justify-between"
                    >
                      <span className={effectiveQuery ? "text-white/90 truncate" : "text-white/40"}>
                        {maskHashUI(effectiveQuery) || "Busque pelas suas atividades aqui"}
                      </span>
                      {!effectiveQuery && selectedId == null && (
                        <span className="hidden sm:inline text-[11px] text-white/40 border border-white/10 rounded px-2 py-[2px]">
                          Ctrl + K
                        </span>
                      )}
                    </button>

                    {(selectedId != null || !!effectiveQuery) && (
                      <button
                        type="button"
                        aria-label="Limpar busca"
                        title="Limpar busca"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => { e.stopPropagation(); clearSearch(); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-[7px] border border-white/10 text-xs text-white/70 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/20"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setMobileFiltersOpen(v => !v)}
                    className="hidden max-[1249px]:inline-flex items-center justify-center rounded-md border border-white/10 bg-[#050505] px-3 sm:px-4 py-3 sm:py-4 text-sm font-medium text-white/80 hover:bg-white/5 transition whitespace-nowrap"
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
                      { value: "payment", label: "payment" },
                      { value: "payment.created", label: "payment.created" },
                      { value: "payment.captured", label: "payment.captured" },
                      { value: "refund", label: "refund" },
                      { value: "login", label: "login" },
                      { value: "kyc.updated", label: "kyc.updated" },
                      { value: "webhook", label: "webhook" },
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
                    className="rounded-md bg-[#050505] border border-white/10 px-3 py-3 text-sm"
                    value={from}
                    onChange={(e) => { setPage(1); setFrom(e.target.value); }}
                  />
                  <input
                    type="date"
                    className="rounded-md bg-[#050505] border border-white/10 px-3 py-3 text-sm"
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
                              className="group rounded-xl border border-white/10 bg-[#050505] p-3 hover:border-white/20 hover:bg-[#0c0c0c] transition will-change-transform will-change-[filter,transform,opacity]"
                            >
                              {/* Wrapper clicável do card para abrir o painel Info */}
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => openInfoFor(it)}
                                onKeyDown={(e) => { if (e.key === "Enter") openInfoFor(it); }}
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
                                      {it.description || "Não há informações"}
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                                      <div className="text-white/80 text-sm">
                                        {formatAmount(it.amount_cents, it.currency)}
                                      </div>
                                      <div className="flex items-center gap-3 text-[12px] text-white/60">
                                        <button
                                          onClick={(e) => copyIp(it.ip, e)}
                                          title={it.ip ? `Copiar IP ${it.ip}` : "Sem IP"}
                                          className="hover:text-white/80 transition"
                                        >
                                        </button>
                                      </div>
                                    </div>

                                    {/* Detalhes avançados */}
                                    <div className="mt-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); toggleExpanded(it.id); }}
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
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <div className="mt-2 rounded-lg border border-white/10 bg:black/10 p-3 text-[12px] text-white/70 grid grid-cols-1 md:grid-cols-2 gap-2">
                                              {/* Identificação */}
                                              <div><span className="text-white/50">ID:</span> {it.id} <span className="text-white/40">({formatIdTag(it.id)})</span></div>
                                              <div className="truncate"><span className="text-white/50">Request:</span> <Copyable text={it.request_id}>{maskId(it.request_id)}</Copyable></div>
                                              <div className="truncate"><span className="text-white/50">Correlation:</span> <Copyable text={it.correlation_id}>{maskId(it.correlation_id)}</Copyable></div>
                                              <div className="truncate"><span className="text-white/50">Session:</span> <Copyable text={it.session_id}>{maskId(it.session_id)}</Copyable></div>
                                              <div className="truncate"><span className="text-white/50">Device:</span> <Copyable text={it.device_id}>{maskId(it.device_id)}</Copyable></div>

                                              {/* Segurança & risco */}
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-white/50">KYC:</span> <Badge>{it.kyc_level || "Não há informações"}</Badge>
                                                <RiskPill score={it.risk_score} />
                                                {Array.isArray(it.risk_flags) && it.risk_flags.length > 0 && (
                                                  <div className="flex flex-wrap gap-1">
                                                    {it.risk_flags.slice(0, 4).map((f) => (<Badge key={f}>{f}</Badge>))}
                                                    {it.risk_flags.length > 4 && <Badge>+{it.risk_flags.length - 4}</Badge>}
                                                  </div>
                                                )}
                                              </div>

                                              {/* Origem & ambiente */}
                                              <div className="truncate">
                                                <span className="text-white/50">Ambiente:</span>{" "}
                                                <Badge className={
                                                  it.environment === "prod" ? "border-red-400/40 text-red-300 bg-red-500/10"
                                                    : it.environment === "sandbox" ? "border-yellow-400/40 text-yellow-200 bg-yellow-500/10"
                                                      : "border-white/15 text-white/80"
                                                }>
                                                  {it.environment || "Não há informações"}
                                                </Badge>
                                              </div>
                                              <div className="truncate"><span className="text-white/50">Origem:</span> {it.source || "Não há informações"}</div>

                                              {/* Localização */}
                                              <div className="truncate"><span className="text-white/50">IP:</span> <Copyable text={it.ip}>{it.ip || "Não há informações"}</Copyable></div>
                                              <div className="truncate">
                                                <span className="text-white/50">Geo:</span>{" "}
                                                {[it.location?.city, it.location?.region, it.location?.country].filter(Boolean).join(" · ") || "Não há informações"} {it.location?.asn ? ` · ASN ${it.location.asn}` : ""}
                                              </div>

                                              {/* Navegador & SO */}
                                              <div className="truncate">
                                                <span className="text-white/50">Navegador:</span>{" "}
                                                {(it.user_agent ? parseUA(it.user_agent) : liveUA).browser || "Não há informações"}
                                              </div>
                                              <div className="truncate">
                                                <span className="text-white/50">SO:</span>{" "}
                                                {(it.user_agent ? parseUA(it.user_agent) : liveUA).os || "Não há informações"}
                                              </div>
                                              <div className="truncate"><span className="text-white/50">User-Agent:</span> <Copyable text={it.user_agent}>{it.user_agent || "Não há informações"}</Copyable></div>

                                              {/* HTTP & performance */}
                                              <div className="truncate">
                                                <span className="text-white/50">HTTP:</span>{" "}
                                                {[it.http?.method, it.http?.path].filter(Boolean).join(" ") || "Não há informações"}
                                              </div>
                                              <div className="truncate"><span className="text-white/50">Status:</span> {it.http?.status ?? "Não há informações"}</div>
                                              <div className="truncate"><span className="text-white/50">Latency:</span> {typeof it.http?.latency_ms === "number" ? `${it.http?.latency_ms} ms` : "Não há informações"}</div>
                                              <div className="truncate"><span className="text-white/50">Idempotency-Key:</span> <Copyable text={it.http?.idempotency_key}>{maskId(it.http?.idempotency_key)}</Copyable></div>

                                              {/* TLS */}
                                              <div className="truncate">
                                                <span className="text-white/50">TLS:</span>{" "}
                                                {[it.tls?.version, it.tls?.cipher].filter(Boolean).join(" · ") || "Não há informações"}
                                              </div>

                                              {/* Pagamento */}
                                              <div className="truncate">
                                                <span className="text-white/50">Cartão:</span>{" "}
                                                {[it.payment?.card_brand, it.payment?.card_last4 ? `•••• ${it.payment?.card_last4}` : null].filter(Boolean).join(" · ") || "Não há informações"}
                                              </div>
                                              <div className="truncate"><span className="text-white/50">Parcelas:</span> {it.payment?.installment_count ?? "Não há informações"}</div>
                                              <div className="truncate">
                                                <span className="text-white/50">Gateway:</span>{" "}
                                                {it.payment?.gateway_code || "Não há informações"}{it.payment?.chargeback ? " · chargeback" : ""}
                                              </div>

                                              {/* Webhook */}
                                              <div className="truncate">
                                                <span className="text-white/50">Webhook:</span>{" "}
                                                {it.webhook?.attempts != null ? `${it.webhook.attempts} tentativa(s)` : "Não há informações"}
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

                  <div className="flex items-center gap-2 text-white/50 h-10">
                    <MenuSelect
                      value={String(pageSize)}
                      onChange={(v) => { setPage(1); setPageSize(Number(v) || 20); }}
                      placeholder={`${pageSize}/página`}
                      options={[10, 20, 50, 100].map((n) => ({ value: String(n), label: `${n}/página` }))}
                      className="w-[120px] [&>button]:py-2 [&>button]:px-2 [&>button]:text-xs"
                      placement="top"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Painel Info com ?at= */}
        <InfoSheet
          open={infoOpen}
          onClose={closeInfo}
          activity={infoActivity}
          atToken={infoAT}
        />

        {/* Overlay de busca */}
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




// app/api/recent-activities/route.ts
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/app/api/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

type JwtPayload = { uid: number };

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MIN_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 10_000;            // evita scans muito grandes
const MAX_Q_LEN = 100;                // limita custo de LIKE
const QUERY_TIMEOUT_MS = 2500;        // timeout por query
const RETRIES = 1;                    // 1 retry leve em falhas transitórias
const BACKOFF_MS = 80;

function requireUserIdFromCookie(req: NextRequest): number {
  const session = req.cookies.get("wzb_lg")?.value;
  if (!session) throw new Error("Unauthorized");

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(session, process.env.JWT_SECRET || "supersecretkey") as JwtPayload;
  } catch {
    throw new Error("Unauthorized");
  }
  const uid = Number(decoded.uid);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error("Unauthorized");
  return uid;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isValidDateISO(d: string): boolean {
  // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T00:00:00Z`);
  return !isNaN(dt.getTime());
}

// Timeout helper (não cancela no driver, mas evita pendurar a rota)
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("QueryTimeout")), ms);
  });
  try {
    // @ts-ignore
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// Retry leve para falhas transitórias (ER_LOCK_DEADLOCK, pool reset, etc.)
async function queryWithRetry<T = any[]>(sql: string, params: any[], retries = RETRIES): Promise<[T, any]> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      // importante: cada tentativa com timeout
      // @ts-ignore
      return await withTimeout(db.query(sql, params), QUERY_TIMEOUT_MS);
    } catch (err: any) {
      lastErr = err;
      const transient =
        err?.code === "ER_LOCK_DEADLOCK" ||
        err?.code === "PROTOCOL_CONNECTION_LOST" ||
        err?.code === "ECONNRESET" ||
        err?.message === "QueryTimeout";
      if (!transient || i === retries) break;
      await new Promise((r) => setTimeout(r, BACKOFF_MS * (i + 1)));
    }
  }
  throw lastErr;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const requestId = randomUUID();

  // Headers padrão pro response
  const baseHeaders = {
    "cache-control": "no-store",
    "x-request-id": requestId,
  } as Record<string, string>;

  try {
    const userId = requireUserIdFromCookie(req);
    const url = new URL(req.url);

    const page = Math.max(1, Number(url.searchParams.get("page") || DEFAULT_PAGE));
    const pageSizeRaw = Number(url.searchParams.get("pageSize") || DEFAULT_PAGE_SIZE);
    const pageSize = clamp(pageSizeRaw, MIN_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = (page - 1) * pageSize;

    // Se o offset for absurdo, evitamos consulta pesada e retornamos vazio "válido"
    if (offset > MAX_OFFSET) {
      const duration = Date.now() - startedAt;
      return NextResponse.json(
        {
          page,
          pageSize,
          total: MAX_OFFSET, // estimativa segura
          items: [],
          hasNextPage: false,
          meta: { degraded: false, estimate: true, requestId, durationMs: duration },
        },
        { headers: baseHeaders }
      );
    }

    const type = (url.searchParams.get("type") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();
    const source = (url.searchParams.get("source") || "").trim();

    let q = (url.searchParams.get("q") || "").trim().replace(/\s+/g, " ");
    if (q.length > MAX_Q_LEN) q = q.slice(0, MAX_Q_LEN);

    const from = (url.searchParams.get("from") || "").trim();
    const to = (url.searchParams.get("to") || "").trim();

    const where: string[] = ["user_id = ?"];
    const params: any[] = [userId];

    if (type)   { where.push("type = ?"); params.push(type); }
    if (status) { where.push("status = ?"); params.push(status); }
    if (source) { where.push("source = ?"); params.push(source); }

    if (q) {
      // LIKE em colunas específicas + índice ajuda; limite de tamanho já aplicado
      where.push("(type LIKE ? OR description LIKE ? OR source LIKE ? OR ip LIKE ? OR user_agent LIKE ?)");
      const pat = `%${q}%`;
      params.push(pat, pat, pat, pat, pat);
    }

    if (from && isValidDateISO(from)) {
      where.push("created_at >= ?");
      params.push(`${from} 00:00:00`);
    }
    if (to && isValidDateISO(to)) {
      where.push("created_at <= ?");
      params.push(`${to} 23:59:59`);
    }

    const whereSql = "WHERE " + where.join(" AND ");

    // Consulta principal
    const listSql = `
      /* recent-activities:list v1 */
      SELECT id, type, status, description, amount_cents, currency, source, ip, user_agent, icon_url, created_at
      FROM user_activity_log
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;
    const countSql = `
      /* recent-activities:count v1 */
      SELECT COUNT(*) AS total
      FROM user_activity_log
      ${whereSql}
    `;

    // 1) Busca itens
    const [rows] = await queryWithRetry<any[]>(listSql, [...params, pageSize, offset]);

    // 2) Count (se falhar, fazemos fallback estimado)
    let total = 0;
    let estimate = false;
    try {
      const [countRows] = await queryWithRetry<any[]>(countSql, params);
      total = Number(countRows?.[0]?.total ?? 0);
      if (!Number.isFinite(total)) total = 0;
    } catch {
      // Fallback: estimativa segura baseada na página atual
      total = offset + rows.length + (rows.length === pageSize ? 1 : 0);
      estimate = true;
    }

    const hasNextPage = offset + rows.length < total;

    const duration = Date.now() - startedAt;
    return NextResponse.json(
      {
        page,
        pageSize,
        total,
        items: rows ?? [],
        hasNextPage,
        nextPage: hasNextPage ? page + 1 : null,
        meta: { degraded: false, estimate, requestId, durationMs: duration },
      },
      { headers: baseHeaders }
    );
  } catch (err: any) {
    const duration = Date.now() - startedAt;

    // Não autenticado
    if (err?.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Unauthorized", meta: { requestId, durationMs: duration } },
        { status: 401, headers: baseHeaders }
      );
    }

    // Fallback seguro: não derruba a UI (200 com payload vazio e sinalizador degraded)
    // Obs.: Se preferir manter 500 para observabilidade, troque '200' por '500'.
    return NextResponse.json(
      {
        page: DEFAULT_PAGE,
        pageSize: DEFAULT_PAGE_SIZE,
        total: 0,
        items: [],
        hasNextPage: false,
        nextPage: null,
        meta: {
          degraded: true,
          estimate: false,
          requestId,
          durationMs: duration,
          error: process.env.NODE_ENV === "production" ? "TemporaryUnavailable" : String(err?.message || err),
        },
      },
      { status: 200, headers: baseHeaders }
    );
  }
} 


// app/api/recent-activities/stream/route.ts
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/app/api/db";

export const runtime = "nodejs";

type JwtPayload = { uid: number };

function requireUserIdFromCookie(req: NextRequest): number {
  const session = req.cookies.get("wzb_lg")?.value;
  if (!session) throw new Error("Unauthorized");
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(session, process.env.JWT_SECRET || "supersecretkey") as JwtPayload;
  } catch {
    throw new Error("Unauthorized");
  }
  const uid = Number(decoded.uid);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error("Unauthorized");
  return uid;
}

export async function GET(req: NextRequest) {
  try {
    const userId = requireUserIdFromCookie(req);
    const url = new URL(req.url);

    const type = url.searchParams.get("type") || "";
    const status = url.searchParams.get("status") || "";
    const source = url.searchParams.get("source") || "";
    const q = (url.searchParams.get("q") || "").trim();
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const sinceMs = Number(url.searchParams.get("since") || Date.now());
    let lastSeen = new Date(sinceMs); // created_at > lastSeen

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();

        function send(ev: "message" | "heartbeat", data?: any) {
          const payload =
            ev === "heartbeat"
              ? `event: heartbeat\ndata: {}\n\n`
              : `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(enc.encode(payload));
        }

        // headers iniciais são definidos na Response
        let active = true;
        const interval = setInterval(() => {
          if (!active) return;
          send("heartbeat");
        }, 20000);

        async function tick() {
          if (!active) return;

          const where: string[] = ["user_id = ? AND created_at > ?"];
          const params: any[] = [userId, lastSeen];

          if (type)   { where.push("type = ?"); params.push(type); }
          if (status) { where.push("status = ?"); params.push(status); }
          if (source) { where.push("source = ?"); params.push(source); }
          if (q) {
            where.push("(type LIKE ? OR description LIKE ? OR source LIKE ? OR ip LIKE ? OR user_agent LIKE ?)");
            const pat = `%${q}%`;
            params.push(pat, pat, pat, pat, pat);
          }
          if (from)   { where.push("created_at >= ?"); params.push(`${from} 00:00:00`); }
          if (to)     { where.push("created_at <= ?"); params.push(`${to} 23:59:59`); }

          const whereSql = "WHERE " + where.join(" AND ");

          try {
            const [rows] = await db.query(
              `
              SELECT id, type, status, description, amount_cents, currency, source, ip, user_agent, icon_url, created_at
                FROM user_activity_log
                ${whereSql}
               ORDER BY created_at ASC
              `,
              params
            );

            const items = rows as any[];
            if (items.length) {
              for (const it of items) {
                send("message", it);
                const ts = new Date(it.created_at);
                if (ts > lastSeen) lastSeen = ts;
              }
            }
          } catch {
            // silêncio: mantém o stream vivo
          }

          setTimeout(tick, 1500);
        }

        tick();

        const abort = req.signal;
        abort.addEventListener("abort", () => {
          active = false;
          clearInterval(interval);
          controller.close();
        });
      },
    });

  return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    return new Response(`event: error\ndata: ${JSON.stringify({ error: err?.message || "Unauthorized" })}\n\n`, {
      status: err?.message === "Unauthorized" ? 401 : 500,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
}



Atualize os 3 codigos ai para funcionar tudo completo com esses novos sql que voce fez ai
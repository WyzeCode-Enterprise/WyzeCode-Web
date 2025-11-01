"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/* -------------------------------------------------
   Hook viewport
-------------------------------------------------- */
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      const matches = (e as MediaQueryList).matches ?? (e as any).matches ?? false;
      setIsMobile(!!matches);
    };
    handler(mq);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      // @ts-ignore
      mq.addListener(handler);
      // @ts-ignore
      return () => mq.removeListener(handler);
    }
  }, []);
  return isMobile;
}

/* -------------------------------------------------
   LocalStorage helpers
-------------------------------------------------- */
const FRONT_KEY = "wzb_dcmp_mf";
const BACK_KEY  = "wzb_dcmp_mb";
const BYTES_6MB = 6 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png","image/jpeg","image/jpg","image/webp","application/pdf"];

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Falha ao ler o arquivo."));
    };
    reader.readAsDataURL(file);
  });
}
function saveImagesToLocalStorage(frontB64: string | null, backB64: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (frontB64) localStorage.setItem(FRONT_KEY, frontB64);
    else localStorage.removeItem(FRONT_KEY);
    if (backB64) localStorage.setItem(BACK_KEY, backB64);
    else localStorage.removeItem(BACK_KEY);
  } catch {}
}
function loadImagesFromLocalStorage() {
  if (typeof window === "undefined") return { front: null, back: null };
  try {
    const front = localStorage.getItem(FRONT_KEY);
    const back  = localStorage.getItem(BACK_KEY);
    return { front: front || null, back: back || null };
  } catch {
    return { front: null, back: null };
  }
}
function removeFrontFromLocalStorage() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(FRONT_KEY); } catch {}
}
function removeBackFromLocalStorage() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(BACK_KEY); } catch {}
}

/* -------------------------------------------------
   Skeleton Loader (para o alerta amarelo)
-------------------------------------------------- */
function AlertPendingSkeleton() {
  return (
    <section
      className="relative w-full h-35 rounded-md bg-[#050505] p-4 sm:p-5"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col gap-4 sm:gap-1 text-left sm:pr-40">
        <div className="flex flex-col gap-1 text-left sm:pr-40">
          {/* linha das “chips” */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-5 w-28 rounded-full bg-[#1E1E1E]/20 animate-pulse" />
            <div className="h-4 w-24 rounded-full bg-[#1E1E1E]/20 animate-pulse" />
          </div>

          {/* “título” */}
          <div className="mt-2 h-4 w-2/3 rounded bg-[#1E1E1E]/20 animate-pulse" />

          {/* parágrafos */}
          <div className="mt-2 space-y-2">
            <div className="h-4 w-full rounded bg-[#1E1E1E]/20 animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-[#1E1E1E]/20 animate-pulse" />
          </div>
        </div>

        {/* botão (mobile) */}
        <div className="sm:hidden mt-2">
          <div className="h-9 w-full rounded-md bg-[#1E1E1E]/20 animate-pulse" />
        </div>
      </div>

      {/* botão (desktop, canto inferior direito) */}
      <div className="hidden sm:block absolute bottom-4 right-4">
        <div className="h-9 w-40 rounded-md bg-[#1E1E1E]/20 animate-pulse" />
      </div>
    </section>
  );
}

/* -------------------------------------------------
   Alerta amarelo (com selo/lock)
-------------------------------------------------- */
export function AlertPending({
  onVerify,
  className,
  locked = false,
}: {
  onVerify?: () => void;
  className?: string;
  locked?: boolean;
}) {
  return (
    <section
      className={cn(
        "relative w-full rounded-md border border-yellow-400/30 bg-[#050505] p-4 sm:p-5",
        "dark:border-yellow-400/30 dark:bg-[#1a1a1a]/60",
        className || ""
      )}
    >
{locked && (
  <div className="absolute right-4 top-3 flex flex-col items-end gap-1">
    <div className="rounded-md border border-yellow-400/40 bg-yellow-500/10 px-2 py-[3px] text-[11px] font-semibold text-yellow-400">
      Seus documentos estão em processo de validação
    </div>
    <p className="max-w-[250px] text-right text-[12.5px] leading-tight text-yellow-400/70">
      Esse processo pode levar de 3 a 5 dias úteis.
    </p>
  </div>
)}

      <div className="flex flex-col gap-4 sm:gap-1 text-left sm:pr-40">
        <div className="flex flex-col gap-1 text-left sm:pr-40">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-yellow-400/40 bg-yellow-500/10 px-2 py-[3px] text-[11px] font-medium leading-none text-yellow-400">
              1° Etapa pendente
            </span>
            <span className="text-[11px] leading-none font-semibold text-yellow-400">
              Verificação pendente
            </span>
          </div>

          <div className="mt-2 text-[16px] font-semibold leading-snug text-yellow-200 sm:text-[17px]">
            Você ainda precisa verificar seus documentos
          </div>

          <p className="max-w-[120ch] text-[13px] leading-relaxed text-yellow-200/70 sm:text-[14px]">
            Valide seu documento e sua idade para ativar o Wyze Bank. Sem essa
            etapa, sua conta permanece limitada ao Wyze Bank Pay e fica sujeita
            a limites de uso e possível retenção de saldo.
          </p>
        </div>

        {/* mobile */}
        <div className="sm:hidden">
          <button
            type="button"
            onClick={locked ? undefined : onVerify}
            disabled={locked}
            className={cn(
              "w-full inline-flex items-center justify-center rounded-md px-6 py-2 text-[13px] font-semibold transition-all",
              locked
                ? "cursor-not-allowed bg-yellow-400/40 text-black/60"
                : "cursor-pointer bg-yellow-400 text-black hover:bg-yellow-300 active:scale-[0.99]",
              "focus:outline-none focus:ring-2 focus:ring-yellow-300/60 focus:ring-offset-0"
            )}
          >
            Verificar documentos
          </button>
        </div>
      </div>

      {/* desktop */}
      <button
        type="button"
        onClick={locked ? undefined : onVerify}
        disabled={locked}
        className={cn(
          "hidden sm:inline-flex",
          "absolute bottom-4 right-4",
          "items-center justify-center rounded-md px-6 py-2 text-[13px] font-semibold transition-all",
          locked
            ? "cursor-not-allowed bg-yellow-400/40 text-black/60"
            : "cursor-pointer bg-yellow-400 text-black hover:bg-yellow-300 active:scale-[0.99]",
          "focus:outline-none focus:ring-2 focus:ring-yellow-300/60 focus:ring-offset-0"
        )}
      >
        Verificar documentos
      </button>
    </section>
  );
}

/* -------------------------------------------------
   Modal de upload frente/verso (com validação em tempo real)
-------------------------------------------------- */
function UploadModal({
  open,
  onClose,
  onConfirm,
  initialFrontB64,
  initialBackB64,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (frontB64: string | null, backB64: string | null) => void;
  initialFrontB64: string | null;
  initialBackB64: string | null;
}) {
  const [frontFile, setFrontFile] = React.useState<File | null>(null);
  const [backFile, setBackFile]   = React.useState<File | null>(null);
  const [frontPreview, setFrontPreview] = React.useState<string | null>(null);
  const [backPreview, setBackPreview]   = React.useState<string | null>(null);

  const [frontError, setFrontError] = React.useState<string | null>(null);
  const [backError, setBackError]   = React.useState<string | null>(null);

  const frontBlobRef = React.useRef<string | null>(null);
  const backBlobRef  = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setFrontPreview(initialFrontB64 || null);
      setBackPreview(initialBackB64 || null);
      setFrontFile(null);
      setBackFile(null);
      setFrontError(null);
      setBackError(null);

      if (frontBlobRef.current) { URL.revokeObjectURL(frontBlobRef.current); frontBlobRef.current = null; }
      if (backBlobRef.current)  { URL.revokeObjectURL(backBlobRef.current);  backBlobRef.current  = null; }
    }
  }, [open, initialFrontB64, initialBackB64]);

  function validateFile(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Formato inválido. Use PNG, JPG, WEBP ou PDF.";
    }
    if (file.size > BYTES_6MB) {
      return "Arquivo excede 6MB. Reduza a imagem/PDF.";
    }
    return null;
  }

  React.useEffect(() => {
    if (frontFile) {
      const err = validateFile(frontFile);
      if (err) {
        setFrontError(err);
        setFrontFile(null);
        setFrontPreview(null);
      } else {
        setFrontError(null);
        const url = URL.createObjectURL(frontFile);
        if (frontBlobRef.current) URL.revokeObjectURL(frontBlobRef.current);
        frontBlobRef.current = url;
        setFrontPreview(url);
      }
    }
  }, [frontFile]);

  React.useEffect(() => {
    if (backFile) {
      const err = validateFile(backFile);
      if (err) {
        setBackError(err);
        setBackFile(null);
        setBackPreview(null);
      } else {
        setBackError(null);
        const url = URL.createObjectURL(backFile);
        if (backBlobRef.current) URL.revokeObjectURL(backBlobRef.current);
        backBlobRef.current = url;
        setBackPreview(url);
      }
    }
  }, [backFile]);

  React.useEffect(() => {
    return () => {
      if (frontBlobRef.current) URL.revokeObjectURL(frontBlobRef.current);
      if (backBlobRef.current)  URL.revokeObjectURL(backBlobRef.current);
    };
  }, []);

  const canConfirm = (!!frontPreview || !!initialFrontB64) || (!!backPreview || !!initialBackB64);
  if (!open) return null;

  async function handleConfirmClick() {
    let finalFrontB64: string | null = null;
    let finalBackB64: string | null = null;

    if (frontFile) finalFrontB64 = await fileToBase64(frontFile);
    else if (initialFrontB64) finalFrontB64 = initialFrontB64;

    if (backFile) finalBackB64 = await fileToBase64(backFile);
    else if (initialBackB64) finalBackB64 = initialBackB64;

    onConfirm(finalFrontB64 || null, finalBackB64 || null);
  }

  function handleRemoveFrontClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    setFrontFile(null);
    setFrontPreview(null);
    setFrontError(null);
    if (frontBlobRef.current) {
      URL.revokeObjectURL(frontBlobRef.current);
      frontBlobRef.current = null;
    }
  }

  function handleRemoveBackClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    setBackFile(null);
    setBackPreview(null);
    setBackError(null);
    if (backBlobRef.current) {
      URL.revokeObjectURL(backBlobRef.current);
      backBlobRef.current = null;
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/70 p-5"
      onMouseDown={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="flex w-full max-w-[800px] flex-col gap-4 rounded-md border border-neutral-800 bg-[#050505] p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <div className="text-[20px] font-semibold text-foreground">Enviar documento</div>
          <div className="text-[14px] leading-relaxed text-muted-foreground">
            Envie frente e verso do seu documento oficial com foto. <span className="font-medium">Máx. 6MB por arquivo</span>.
          </div>
        </div>

        {/* Frente */}
        <div className="flex flex-col gap-2">
          <div className="text-[16px] font-medium text-foreground">Frente do documento</div>

          <label className="group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-neutral-700/80 bg-neutral-950/40 px-4 py-8 text-center transition-colors hover:border-neutral-500/80 hover:bg-neutral-900/40">
            {frontPreview ? (
              <div className="relative h-[200px] w-full overflow-hidden rounded-md bg-black ring-1 ring-border">
                <img src={frontPreview} alt="Frente documento" className="absolute inset-0 h-full w-full object-contain" />
                <div className="absolute inset-x-0 top-0 z-10 flex justify-end px-2 py-2">
                  <button
                    type="button"
                    onClick={handleRemoveFrontClick}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] font-semibold text-white hover:bg-black/90"
                    title="Remover frente"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div className="pointer-events-none flex flex-col items-center gap-2 text-muted-foreground">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800/60 text-[11px] font-semibold text-foreground ring-1 ring-border">
                  FRENTE
                </div>
                <div className="flex flex-col gap-1 text-center text-[12px] leading-tight">
                  <span className="font-medium text-foreground">Clique para enviar</span>
                  <span className="text-muted-foreground">PNG, JPG, WEBP ou PDF — máx 6MB</span>
                </div>
              </div>
            )}
            <input
              type="file"
              accept={ALLOWED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFrontFile(f);
              }}
            />
          </label>
          {frontError && (
            <div className="text-[12px] text-red-400" role="alert" aria-live="polite">{frontError}</div>
          )}
        </div>

        {/* Verso */}
        <div className="flex flex-col gap-2">
          <div className="text-[16px] font-medium text-foreground">Verso do documento</div>

          <label className="group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-neutral-700/80 bg-neutral-950/40 px-4 py-8 text-center transition-colors hover:border-neutral-500/80 hover:bg-neutral-900/40">
            {backPreview ? (
              <div className="relative h-[200px] w-full overflow-hidden rounded-md bg-black ring-1 ring-border">
                <img src={backPreview} alt="Verso documento" className="absolute inset-0 h-full w-full object-contain" />
                <div className="absolute inset-x-0 top-0 z-10 flex justify-end px-2 py-2">
                  <button
                    type="button"
                    onClick={handleRemoveBackClick}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] font-semibold text-white hover:bg-black/90"
                    title="Remover verso"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div className="pointer-events-none flex flex-col items-center gap-2 text-muted-foreground">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800/60 text-[11px] font-semibold text-foreground ring-1 ring-border">
                  VERSO
                </div>
                <div className="flex flex-col gap-1 text-center text-[12px] leading-tight">
                  <span className="font-medium text-foreground">Clique para enviar</span>
                  <span className="text-muted-foreground">PNG, JPG, WEBP ou PDF — máx 6MB</span>
                </div>
              </div>
            )}
            <input
              type="file"
              accept={ALLOWED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setBackFile(f);
              }}
            />
          </label>
          {backError && (
            <div className="text-[12px] text-red-400" role="alert" aria-live="polite">{backError}</div>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            className={cn(
              "w-full cursor-pointer rounded-md bg-[#26FF59]/90 py-[1.375rem] text-[15px] font-semibold text-black hover:bg-[#26FF59]",
              !canConfirm && "pointer-events-none cursor-not-allowed opacity-30"
            )}
            onClick={handleConfirmClick}
            disabled={!canConfirm}
          >
            Confirmar envio
          </Button>

          <Button
            variant="outline"
            className="w-full cursor-pointer bg-[#050505] py-[1.375rem] text-[15px] font-semibold"
            onClick={onClose}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------
   Bloco de confirmação inline (único, centralizado)
-------------------------------------------------- */
function InlineConfirmation() {
  return (
    <div className="flex min-h-[100vh] items-center justify-center">
      <div className="w-full max-w-[520px] rounded-xl p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#26FF59]/20">
          <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
            <path d="M20 6L9 17l-5-5" className="text-[#26FF59]" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h3 className="text-[25px] font-semibold text-white">Documentos enviados</h3>
        <p className="mt-2 text-[16px] leading-relaxed text-white/70">
          Seus documentos foram enviados com sucesso e estão em análise.
          O processo pode levar de <strong>3 a 5 dias úteis</strong>.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------
   Drawer principal
   - Quando inlineSuccess === true, renderiza apenas <InlineConfirmation />
     (sem header, sem dados pessoais, sem footer) e centralizado.
-------------------------------------------------- */
function VerifyDocumentsDrawer({
  open,
  onOpenChange,
  user,
  lockedFromServer = false,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  user?: { id: number; name: string; email: string; cpfOrCnpj: string; phone: string };
  lockedFromServer?: boolean;
  onSubmitted?: () => void;
}) {
  const isMobile = useIsMobile();

  // documentos
  const [frontConfirmed, setFrontConfirmed] = React.useState<string | null>(null);
  const [backConfirmed, setBackConfirmed]   = React.useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);

  // selfie / qr
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);
  const [sessionTicket, setSessionTicket] = React.useState<string | null>(null);
  const [qrLoading, setQrLoading] = React.useState(false);
  const [qrError, setQrError]     = React.useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = React.useState<string | null>(null);

  // envio
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const inFlightSubmit = React.useRef(false);

  // evita bootstrap duplo
  const bootstrappedRef = React.useRef(false);

  // Carrega frente/verso locais
  React.useEffect(() => {
    if (!open) return;
    const { front, back } = loadImagesFromLocalStorage();
    if (front) setFrontConfirmed(front);
    if (back)  setBackConfirmed(back);
  }, [open]);

  // Cria/renova sessão QR (apenas se não houver selfie ainda e não estiver travado)
  const bootstrapQRSession = React.useCallback(async () => {
    if (selfiePreview) return;
    if (lockedFromServer || submitted) return;

    try {
      setQrLoading(true);
      setQrError(null);
      const resp = await fetch("/api/qrface", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store" });
      const data = await resp.json();
      if (!resp.ok) {
        setQrError(data.error || "Erro ao gerar QR Code.");
        setQrLoading(false);
        return;
      }
      if (data.status === "face_captured" && data.selfie_b64) {
        setSelfiePreview((p) => p || data.selfie_b64);
        setQrLoading(false);
        return;
      }
      setSessionTicket(data.session || null);
      setQrUrl(data.url || null);
      setQrLoading(false);
    } catch {
      setQrError("Falha de rede ao gerar QR Code.");
      setQrLoading(false);
    }
  }, [selfiePreview, lockedFromServer, submitted]);

  React.useEffect(() => {
    if (!open) {
      bootstrappedRef.current = false;
      return;
    }
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    bootstrapQRSession();
  }, [open, bootstrapQRSession]);

  // polling selfie
  React.useEffect(() => {
    if (!open || !sessionTicket || selfiePreview || lockedFromServer || submitted) return;
    const myTicket = sessionTicket;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/qrface?session=${encodeURIComponent(myTicket)}`, { method: "GET", cache: "no-store" });
        const data = await res.json();
        if (!res.ok) return;
        if (data.status === "face_captured" && data.selfie_b64) {
          setSelfiePreview((p) => p || data.selfie_b64);
        }
      } catch {}
    }, 2500);
    return () => clearInterval(id);
  }, [open, sessionTicket, selfiePreview, lockedFromServer, submitted]);

  // remover selfie
  async function handleRemoveSelfie(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (lockedFromServer || submitted) return;
    try {
      setQrLoading(true);
      setQrError(null);
      const resp = await fetch("/api/qrface", { method: "DELETE", cache: "no-store" });
      const data = await resp.json();
      if (!resp.ok) {
        setQrError(data.error || "Erro ao reiniciar verificação facial.");
        setQrLoading(false);
        return;
      }
      setSelfiePreview(null);
      setSessionTicket(data.session || null);
      setQrUrl(data.url || null);
      setQrLoading(false);
    } catch {
      setQrError("Falha de rede ao reiniciar verificação facial.");
      setQrLoading(false);
    }
  }

  // modal documento
  function handleConfirmUpload(finalFrontB64: string | null, finalBackB64: string | null) {
    setFrontConfirmed(finalFrontB64);
    setBackConfirmed(finalBackB64);
    saveImagesToLocalStorage(finalFrontB64, finalBackB64);
    setUploadModalOpen(false);
  }
  function handleOpenUploadModal() {
    if (lockedFromServer || submitted) return;
    setUploadModalOpen(true);
  }
  function handleCloseUploadModal() {
    setUploadModalOpen(false);
  }
  function handleRemoveFront(e: React.MouseEvent) {
    e.stopPropagation();
    if (lockedFromServer || submitted) return;
    setFrontConfirmed(null);
    removeFrontFromLocalStorage();
  }
  function handleRemoveBack(e: React.MouseEvent) {
    e.stopPropagation();
    if (lockedFromServer || submitted) return;
    setBackConfirmed(null);
    removeBackFromLocalStorage();
  }

  // envio final
  async function handleSubmitDocument() {
    if (lockedFromServer || submitted) return;
    if (inFlightSubmit.current) return;
    setSubmitError(null);

    if (!frontConfirmed || !backConfirmed || !selfiePreview) {
      setSubmitError("É necessário enviar a frente e o verso do documento e capturar a selfie.");
      return;
    }

    inFlightSubmit.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/envite-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          front_b64: frontConfirmed,
          back_b64: backConfirmed,
          selfie_b64: selfiePreview,
          user: {
            name: user?.name,
            email: user?.email,
            cpfOrCnpj: user?.cpfOrCnpj,
            phone: user?.phone,
            id: user?.id,
          },
        }),
      });

      const data = await res.json();

      if (res.status === 409 && (data?.code === "ALREADY_IN_REVIEW" || data?.locked)) {
        setSubmitted(true);
        onSubmitted?.();
        return;
      }
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Falha ao enviar os documentos.");
      }

      setSubmitted(true);
      onSubmitted?.();
    } catch (err: any) {
      setSubmitError(err?.message || "Erro ao enviar os documentos.");
    } finally {
      setSubmitting(false);
      inFlightSubmit.current = false;
    }
  }

  function handleDrawerOpenChange(next: boolean) {
    if (!next && uploadModalOpen) return; // evita fechar com modal aberto
    onOpenChange(next);
  }

  const canSend = !!frontConfirmed && !!backConfirmed && !!selfiePreview;
  const inlineSuccess = lockedFromServer || submitted;

  return (
    <>
      <UploadModal
        open={uploadModalOpen}
        onClose={handleCloseUploadModal}
        onConfirm={handleConfirmUpload}
        initialFrontB64={frontConfirmed}
        initialBackB64={backConfirmed}
      />

      <Drawer open={open} onOpenChange={handleDrawerOpenChange} direction={isMobile ? "bottom" : "right"}>
        <DrawerContent
          className={cn(
            "bg-background fixed z-50 flex h-auto flex-col",
            "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
            "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
            "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-[90vw] data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-md data-[vaul-drawer-direction=right]:lg:max-w-lg",
            "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-[90vw] data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-md data-[vaul-drawer-direction=left]:lg:max-w-lg"
          )}
        >
          {inlineSuccess ? (
            // Só a confirmação central, sem header/dados/footer
            <InlineConfirmation />
          ) : (
            <>
              {/* Cabeçalho */}
              <div className="px-4 pt-4 sm:px-6">
                <h2 className="text-[20px] font-semibold text-foreground">Verificação de Identidade</h2>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  Para liberar limites maiores (PIX, cartão etc.), confirme quem é você.
                </p>
              </div>

              {/* Conteúdo */}
              <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm sm:px-6">
                {/* DADOS PESSOAIS (somente antes do envio) */}
                <div className="grid gap-4 text-[13px] leading-relaxed">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nome completo</label>
                      <input readOnly value={user?.name || "Usuário"} className="w-full select-none rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">CPF / CNPJ</label>
                      <input readOnly value={user?.cpfOrCnpj || "—"} className="w-full select-none rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">E-mail</label>
                      <input readOnly value={user?.email || "indisponível@wyzebank.com"} className="w-full break-all select-none rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Telefone</label>
                      <input readOnly value={user?.phone || "—"} className="w-full select-none rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default" />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* DOCUMENTO ENVIADO (quadro pontilhado) */}
                <div className="grid gap-2">
                  <div className="text-[16px] font-medium text-foreground">Documento enviado</div>
                  <div className="text-[14px] leading-snug text-muted-foreground">
                    Essas são as imagens que você confirmou. Se algo estiver errado, você pode reenviar.
                  </div>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={handleOpenUploadModal}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleOpenUploadModal();
                      }
                    }}
                    className={cn(
                      "group relative w-full cursor-pointer rounded-md border border-dashed border-neutral-700/80 bg-neutral-950/40 px-4 py-4 text-left outline-none transition-colors hover:border-neutral-500/80 hover:bg-neutral-900/40 focus:ring-2 focus:ring-neutral-600/50"
                    )}
                  >
                    {frontConfirmed || backConfirmed ? (
                      <div className="grid w-full gap-4 sm:grid-cols-2">
                        {/* Frente */}
                        <div className="relative h-[160px] w-full overflow-hidden rounded-md bg-black ring-1 ring-border">
                          {frontConfirmed ? (
                            <>
                              <img src={frontConfirmed} alt="Frente confirmada" className="absolute inset-0 h-full w-full object-contain" />
                              <div className="absolute inset-x-0 top-0 z-10 flex justify-end px-2 py-2">
                                <button
                                  type="button"
                                  onClick={handleRemoveFront}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] font-semibold text-white hover:bg-black/90"
                                  title="Remover frente"
                                >
                                  ✕
                                </button>
                              </div>
                              <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white ring-1 ring-white/20">
                                Frente
                              </div>
                            </>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">Frente pendente</div>
                          )}
                        </div>

                        {/* Verso */}
                        <div className="relative h-[160px] w-full overflow-hidden rounded-md bg-black ring-1 ring-border">
                          {backConfirmed ? (
                            <>
                              <img src={backConfirmed} alt="Verso confirmada" className="absolute inset-0 h-full w-full object-contain" />
                              <div className="absolute inset-x-0 top-0 z-10 flex justify-end px-2 py-2">
                                <button
                                  type="button"
                                  onClick={handleRemoveBack}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] font-semibold text-white hover:bg-black/90"
                                  title="Remover verso"
                                >
                                  ✕
                                </button>
                              </div>
                              <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white ring-1 ring-white/20">
                                Verso
                              </div>
                            </>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">Verso pendente</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800/60 text-[11px] font-semibold text-foreground ring-1 ring-border">
                          DOC
                        </div>
                        <div className="flex flex-col gap-1 text-center text-[12px] leading-tight">
                          <span className="font-medium text-foreground">Enviar documento</span>
                          <span className="text-muted-foreground">Frente e verso • obrigatório</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {submitError && <div className="text-[12px] text-red-400" role="alert" aria-live="polite">{submitError}</div>}

                  <div className="text-[14px] leading-relaxed text-muted-foreground">
                    • Documento legível (sem blur / sem corte).<br />• Não use filtros pesados nem tampe informação.
                  </div>
                </div>

                <Separator />

                {/* SELFIE / QR */}
                <div className="grid gap-2 pt-2">
                  <div className="text-[16px] font-medium text-foreground">Selfie de verificação</div>
                  <div className="text-[14px] leading-snug text-muted-foreground">Aponte a câmera do seu celular para o QR e siga as instruções.</div>

                  <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-neutral-700/80 bg-neutral-950/40 px-4 py-8 text-center transition-colors hover:border-neutral-500/80 hover:bg-neutral-900/40">
                    <div className="relative flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-md bg-white">
                      {/* Carregando */}
                      {qrLoading && !selfiePreview && (
                        <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-neutral-800 text-[11px] font-semibold text-neutral-400 ring-1 ring-border">
                          Gerando QR...
                        </div>
                      )}

                      {/* Erro */}
                      {qrError && !selfiePreview && (
                        <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md px-4 text-center text-[11px] font-semibold leading-relaxed text-red-400 ring-1 ring-border">
                          {qrError}
                        </div>
                      )}

                      {/* Selfie ok */}
                      {selfiePreview && (
                        <div className="relative h-[200px] w-[200px] overflow-hidden rounded-md bg-neutral-900 ring-2 ring-[#26FF59]/60 shadow-[0_0_40px_#26FF5966]">
                          <img src={selfiePreview} alt="Selfie capturada" className="absolute inset-0 h-full w-full object-cover" />
                          <div className="absolute inset-x-0 top-0 z-10 flex justify-end px-2 py-2">
                            <button
                              type="button"
                              onClick={handleRemoveSelfie}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] font-semibold text-white hover:bg-black/90"
                              title="Remover selfie e gerar novo QR"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}

                      {/* QR */}
                      {!qrLoading && !qrError && !selfiePreview && qrUrl && (
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                          alt="QR code para verificação facial"
                          className="h-[190px] w-[190px] rounded-md bg-white object-contain ring-border"
                        />
                      )}

                      {/* Fallback */}
                      {!qrLoading && !qrError && !selfiePreview && !qrUrl && (
                        <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-neutral-800 text-[10px] font-semibold text-neutral-400 ring-1 ring-border">
                          QR CODE
                        </div>
                      )}
                    </div>

                    {/* Ações de QR quando erro */}
                    {qrError && !selfiePreview && (
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" onClick={bootstrapQRSession}>Tentar novamente</Button>
                      </div>
                    )}
                  </div>

                  <div className="text-[13px] leading-relaxed text-muted-foreground">
                    • Boa iluminação e rosto totalmente visível.<br />• Sem óculos escuros, máscara ou boné cobrindo o rosto.
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="gap-2 px-4 pb-4 pt-0 sm:px-6">
                <Button
                  size="sm"
                  className={cn(
                    "w-full rounded-md py-5 text-[14px] font-semibold",
                    !canSend
                      ? "pointer-events-none cursor-not-allowed opacity-30 bg-[#26FF59]/90 text-black"
                      : "bg-[#26FF59]/90 text-black hover:bg-[#26FF59]"
                  )}
                  onClick={handleSubmitDocument}
                  disabled={!canSend || submitting}
                >
                  {submitting ? "Enviando..." : "Enviar documento"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full cursor-pointer py-5 text-[14px] font-semibold"
                  onClick={() => handleDrawerOpenChange(false)}
                >
                  Fechar
                </Button>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}

/* -------------------------------------------------
   Wrapper (alerta + drawer) com skeleton no load e verificação no F5
-------------------------------------------------- */
export function VerifyDocumentsSection({
  user,
}: {
  user: { id: number; name: string; email: string; cpfOrCnpj: string; phone: string };
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [inReview, setInReview]     = React.useState(false);
  const [loadingStatus, setLoadingStatus] = React.useState(true);

  // Checa no load (e no F5) se já está em análise/aprovado
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/envite-docs", { method: "GET", cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (res.ok && data?.success) {
          setInReview(!!data.locked);
        } else {
          setInReview(false);
        }
      } catch {
        setInReview(false);
      } finally {
        if (alive) setLoadingStatus(false);
      }
    })();
    return () => { alive = false; };
  }, []);
  

  return (
    <>
      {loadingStatus ? (
        <AlertPendingSkeleton />
      ) : (
        <AlertPending
          onVerify={() => setDrawerOpen(true)}
          className="border-yellow-400/30 bg-[#050505]"
          locked={inReview}
        />
      )}

      <VerifyDocumentsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        user={user}
        lockedFromServer={inReview}
        onSubmitted={() => {
          setInReview(true); // trava alerta e mantém confirmação inline
        }}
      />
    </>
  );
}

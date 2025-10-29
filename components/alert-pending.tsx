"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/* -------------------------------------------------
   Hook simples: detectar mobile
-------------------------------------------------- */
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");

    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile((e as MediaQueryList).matches ?? (e as any).matches);
    };

    handler(mq);

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      mq.addListener(handler as any);
      return () => mq.removeListener(handler as any);
    }
  }, []);

  return isMobile;
}

/* -------------------------------------------------
   Helpers de localStorage para doc frente/verso
-------------------------------------------------- */
const FRONT_KEY = "wzb_dcmp_mf";
const BACK_KEY = "wzb_dcmp_mb";

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
  } catch (err) {
    console.warn("Erro salvando no localStorage", err);
  }
}

function loadImagesFromLocalStorage() {
  if (typeof window === "undefined") {
    return { front: null, back: null };
  }
  try {
    const front = localStorage.getItem(FRONT_KEY);
    const back = localStorage.getItem(BACK_KEY);
    return { front: front || null, back: back || null };
  } catch (err) {
    console.warn("Erro lendo localStorage", err);
    return { front: null, back: null };
  }
}

function removeFrontFromLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(FRONT_KEY);
  } catch (err) {
    console.warn("Erro removendo frente do localStorage", err);
  }
}

function removeBackFromLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BACK_KEY);
  } catch (err) {
    console.warn("Erro removendo verso do localStorage", err);
  }
}

/* -------------------------------------------------
   AlertPending (cartão amarelo no dashboard)
-------------------------------------------------- */
export function AlertPending({
  onVerify,
  className,
}: {
  onVerify?: () => void;
  className?: string;
}) {
  return (
    <section
      className={[
        "relative w-full rounded-md border border-yellow-400/30 bg-[#050505] p-4 sm:p-5",
        "dark:border-yellow-400/30 dark:bg-[#1a1a1a]/60",
        className || "",
      ].join(" ")}
    >
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
            etapa, sua conta permanece limitada ao Wyze Bank Pay e fica sujeita a
            limites de uso e possível retenção de saldo.
          </p>
        </div>

        <div className="sm:hidden">
          <button
            type="button"
            onClick={onVerify}
            className={[
              "w-full inline-flex cursor-pointer items-center justify-center rounded-md",
              "bg-yellow-400 px-6 py-2 text-[13px] font-semibold text-black",
              "hover:bg-yellow-300 active:scale-[0.99]",
              "focus:outline-none focus:ring-2 focus:ring-yellow-300/60 focus:ring-offset-0",
              "transition-all",
            ].join(" ")}
          >
            Verificar documentos
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onVerify}
        className={[
          "hidden sm:inline-flex",
          "absolute bottom-4 right-4",
          "cursor-pointer items-center justify-center rounded-md",
          "bg-yellow-400 px-6 py-2 text-[13px] font-semibold text-black",
          "hover:bg-yellow-300 active:scale-[0.99]",
          "focus:outline-none focus:ring-2 focus:ring-yellow-300/60 focus:ring-offset-0",
          "transition-all",
        ].join(" ")}
      >
        Verificar documentos
      </button>
    </section>
  );
}

/* -------------------------------------------------
   Modal de upload (frente/verso do documento)
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
  const [backFile, setBackFile] = React.useState<File | null>(null);
  const [frontPreview, setFrontPreview] = React.useState<string | null>(null);
  const [backPreview, setBackPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setFrontPreview(initialFrontB64 || null);
      setBackPreview(initialBackB64 || null);
      setFrontFile(null);
      setBackFile(null);
    }
  }, [open, initialFrontB64, initialBackB64]);

  React.useEffect(() => {
    if (frontFile) {
      const url = URL.createObjectURL(frontFile);
      setFrontPreview(url);
    }
  }, [frontFile]);

  React.useEffect(() => {
    if (backFile) {
      const url = URL.createObjectURL(backFile);
      setBackPreview(url);
    }
  }, [backFile]);

  const canConfirm = !!frontPreview || !!backPreview;
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

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999999] flex items-center justify-center p-5 bg-black/70"
      )}
      onMouseDown={onClose}
    >
      <div
        className={cn(
          "flex w-full max-w-[800px] flex-col gap-4 rounded-md border border-neutral-800 bg-[#0a0a0a] p-5 shadow-xl"
        )}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex flex-col gap-1">
          <div className="text-[20px] font-semibold text-foreground">
            Enviar documento
          </div>
          <div className="text-[14px] leading-relaxed text-muted-foreground">
            Envie frente e verso do seu documento oficial com foto. Precisa
            estar nítido, sem corte e sem dedo cobrindo informação.
          </div>
        </div>

        {/* Frente */}
        <div className="flex flex-col gap-2">
          <div className="text-[16px] font-medium text-foreground">
            Frente do documento
          </div>

          <label
            className={cn(
              "group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-neutral-700/80 bg-neutral-950/40 px-4 py-8 text-center transition-colors hover:border-neutral-500/80 hover:bg-neutral-900/40"
            )}
          >
            {frontPreview ? (
              <div className="relative h-[200px] w-full overflow-hidden rounded-md bg-black ring-1 ring-border">
                <Image
                  src={frontPreview}
                  alt="Frente documento"
                  fill
                  className="object-contain"
                />
              </div>
            ) : (
              <div className="pointer-events-none flex flex-col items-center gap-2 text-muted-foreground">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800/60 text-[11px] font-semibold text-foreground ring-1 ring-border">
                  FRENTE
                </div>
                <div className="flex flex-col gap-1 text-center text-[12px] leading-tight">
                  <span className="font-medium text-foreground">
                    Clique para enviar
                  </span>
                  <span className="text-muted-foreground">
                    PNG, JPG, PDF — máx 10MB
                  </span>
                </div>
              </div>
            )}

            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFrontFile(f);
              }}
            />
          </label>
        </div>

        {/* Verso */}
        <div className="flex flex-col gap-2">
          <div className="text-[16px] font-medium text-foreground">
            Verso do documento
          </div>

          <label
            className={cn(
              "group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-neutral-700/80 bg-neutral-950/40 px-4 py-8 text-center transition-colors hover:border-neutral-500/80 hover:bg-neutral-900/40"
            )}
          >
            {backPreview ? (
              <div className="relative h-[200px] w-full overflow-hidden rounded-md bg-black ring-1 ring-border">
                <Image
                  src={backPreview}
                  alt="Verso documento"
                  fill
                  className="object-contain"
                />
              </div>
            ) : (
              <div className="pointer-events-none flex flex-col items-center gap-2 text-muted-foreground">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800/60 text-[11px] font-semibold text-foreground ring-1 ring-border">
                  VERSO
                </div>
                <div className="flex flex-col gap-1 text-center text-[12px] leading-tight">
                  <span className="font-medium text-foreground">
                    Clique para enviar
                  </span>
                  <span className="text-muted-foreground">
                    PNG, JPG, PDF — máx 10MB
                  </span>
                </div>
              </div>
            )}

            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setBackFile(f);
              }}
            />
          </label>
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
            className="w-full cursor-pointer py-[1.375rem] text-[15px] font-semibold bg-[#0A0A0A]"
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
   Drawer principal
-------------------------------------------------- */
function VerifyDocumentsDrawer({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  user?: {
    id?: number; // <-- se você tiver o ID do user logado, passa aqui
    name: string;
    email: string;
    cpfOrCnpj: string;
    phone: string;
  };
}) {
  const isMobile = useIsMobile();

  // documento confirmado (preview no drawer)
  const [frontConfirmed, setFrontConfirmed] = React.useState<string | null>(null);
  const [backConfirmed, setBackConfirmed] = React.useState<string | null>(null);

  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);

  // QR / Selfie flow
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);
  const [qrToken, setQrToken] = React.useState<string | null>(null);
  const [qrLoading, setQrLoading] = React.useState(false);
  const [qrError, setQrError] = React.useState<string | null>(null);

  // selfie capturada (pra trocar o QR ao vivo)
  const [selfiePreview, setSelfiePreview] = React.useState<string | null>(null);

  // carregar previews de doc localStorage quando drawer abre
  React.useEffect(() => {
    if (!open) return;

    const { front, back } = loadImagesFromLocalStorage();
    if (front) setFrontConfirmed(front);
    if (back) setBackConfirmed(back);
  }, [open]);

 // gerar ou recuperar QR/token quando o drawer abre
React.useEffect(() => {
  async function fetchOrCreateQR() {
    if (!open) return;

    // se já temos token salvo em memória, não recria
    if (qrToken) return;

    try {
      setQrLoading(true);
      setQrError(null);

      // agora o backend descobre o usuário via cookie/jwt,
      // então não mandamos nada no body.
      const resp = await fetch("/api/qrface", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // body vazio mesmo
      });

      const data = await resp.json();

      if (!resp.ok) {
        setQrError(data.error || "Erro ao gerar QR Code.");
        setQrLoading(false);
        return;
      }

      // salva a URL que vai virar QR
      setQrUrl(data.url || null);

      // salva o token puro (pra polling via GET /api/qrface?token=...)
      setQrToken(data.token || null);

      // se o backend já retornou selfie_b64 porque já tinha face_captured,
      // já atualiza preview agora:
      if (data.selfie_b64) {
        setSelfiePreview(data.selfie_b64);
      }

      setQrLoading(false);
    } catch (err: any) {
      console.error("QR fetch error:", err);
      setQrError("Erro de rede ao gerar QR Code.");
      setQrLoading(false);
    }
  }

  fetchOrCreateQR();
}, [open, qrToken]);

    // polling pra ver se já chegou selfie
  React.useEffect(() => {
    // se o drawer não tá aberto ou ainda não temos token, não faz nada
    if (!open) return;
    if (!qrToken) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    async function doPoll(currentToken: string) {
      try {
        const res = await fetch(
          `/api/qrface?token=${encodeURIComponent(currentToken)}`,
          { method: "GET" }
        );
        const data = await res.json();

        if (!res.ok) {
          console.warn("Polling erro:", data.error);
          return;
        }

        // se já tem selfie_b64 -> atualiza preview
        if (data.selfie_b64) {
          setSelfiePreview(data.selfie_b64);
        }
      } catch (err) {
        console.warn("Polling falhou:", err);
      }
    }

    // dispara imediatamente
    doPoll(qrToken);

    // e depois continua chamando a cada 2.5s
    intervalId = setInterval(() => {
      if (!stopped && qrToken) {
        doPoll(qrToken);
      }
    }, 2500);

    // cleanup
    return () => {
      stopped = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [open, qrToken]);

  function handleConfirmUpload(finalFrontB64: string | null, finalBackB64: string | null) {
    setFrontConfirmed(finalFrontB64);
    setBackConfirmed(finalBackB64);
    saveImagesToLocalStorage(finalFrontB64, finalBackB64);
    setUploadModalOpen(false);
  }

  function handleOpenUploadModal() {
    setUploadModalOpen(true);
  }

  function handleCloseUploadModal() {
    setUploadModalOpen(false);
  }

  function handleRemoveFront(e: React.MouseEvent) {
    e.stopPropagation();
    setFrontConfirmed(null);
    removeFrontFromLocalStorage();
  }

  function handleRemoveBack(e: React.MouseEvent) {
    e.stopPropagation();
    setBackConfirmed(null);
    removeBackFromLocalStorage();
  }

  // envio final do documento (futuro)
  function handleSubmitDocument() {
    console.log("Enviar documento:", {
      frente: frontConfirmed,
      verso: backConfirmed,
      selfiePreview,
      qrToken,
    });
    // aqui depois você faz o POST final para aprovar/verificar
  }

  // impedir fechar drawer se modal interno estiver aberto
  function handleDrawerOpenChange(next: boolean) {
    if (!next && uploadModalOpen) return;
    onOpenChange(next);
  }

  const displayName = user?.name || "Usuário";
  const cpfOrCnpj = user?.cpfOrCnpj || "—";
  const email = user?.email || "indisponível@wyzebank.com";
  const phone = user?.phone || "—";

  return (
    <>
      {/* modal de upload (sobreposto) */}
      <UploadModal
        open={uploadModalOpen}
        onClose={handleCloseUploadModal}
        onConfirm={handleConfirmUpload}
        initialFrontB64={frontConfirmed}
        initialBackB64={backConfirmed}
      />

      <Drawer
        open={open}
        onOpenChange={handleDrawerOpenChange}
        direction={isMobile ? "bottom" : "right"}
      >
        <DrawerContent
          className={cn(
            "group/drawer-content bg-background fixed z-50 flex h-auto flex-col",
            "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
            "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
            "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-[90vw] data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-md data-[vaul-drawer-direction=right]:lg:max-w-lg",
            "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-[90vw] data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-md data-[vaul-drawer-direction=left]:lg:max-w-lg"
          )}
        >
          {/* puxador mobile */}
          <div className="group-data-[vaul-drawer-direction=bottom]/drawer-content:block bg-[#050505] mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full" />

          <DrawerHeader className="gap-1 px-4 sm:px-6">
            <DrawerTitle className="text-[20px] font-semibold text-foreground">
              Verificação de Identidade
            </DrawerTitle>
            <DrawerDescription className="text-[15px] leading-relaxed text-muted-foreground">
              Para liberar todos os recursos (PIX, cartão, limites maiores) você
              precisa confirmar quem é você. Envie um documento oficial com
              foto e valide sua selfie.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm sm:px-6">
            {/* DADOS PESSOAIS */}
            <div className="grid gap-4 text-[13px] leading-relaxed">
              <div className="grid grid-cols-2 gap-4">
                {/* Nome */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Nome completo
                  </label>
                  <input
                    readOnly
                    value={displayName}
                    className="w-full rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default user-none"
                  />
                </div>

                {/* CPF/CNPJ */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    CPF / CNPJ
                  </label>
                  <input
                    readOnly
                    value={cpfOrCnpj}
                    className="w-full rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default user-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Email */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    E-mail
                  </label>
                  <input
                    readOnly
                    value={email}
                    className="w-full break-all rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default user-none"
                  />
                </div>

                {/* Telefone */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Telefone
                  </label>
                  <input
                    readOnly
                    value={phone}
                    className="w-full rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default user-none"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* DOCUMENTO ENVIADO */}
            <div className="grid gap-2">
              <div className="text-[16px] font-medium text-foreground">
                Documento enviado
              </div>

              <div className="text-[14px] leading-snug text-muted-foreground">
                Essas são as imagens que você confirmou. Se algo estiver errado,
                você pode reenviar.
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
                  "group relative w-full cursor-pointer rounded-md border border-dashed border-neutral-700/80 bg-neutral-950/40 px-4 py-4 text-left transition-colors hover:border-neutral-500/80 hover:bg-neutral-900/40 outline-none focus:ring-2 focus:ring-neutral-600/50"
                )}
              >
                {frontConfirmed || backConfirmed ? (
                  <div className="grid w-full gap-4 sm:grid-cols-2">
                    {/* Frente */}
                    <div className="relative h-[160px] w-full overflow-hidden rounded-md bg-black ring-1 ring-border">
                      {frontConfirmed ? (
                        <>
                          <Image
                            src={frontConfirmed}
                            alt="Frente confirmada"
                            fill
                            className="object-contain"
                          />
                          <button
                            type="button"
                            onClick={handleRemoveFront}
                            className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] font-semibold text-white hover:bg-black/90"
                          >
                            ✕
                          </button>
                          <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white ring-1 ring-white/20">
                            Frente
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                          Frente pendente
                        </div>
                      )}
                    </div>

                    {/* Verso */}
                    <div className="relative h-[160px] w-full overflow-hidden rounded-md bg-black ring-1 ring-border">
                      {backConfirmed ? (
                        <>
                          <Image
                            src={backConfirmed}
                            alt="Verso confirmada"
                            fill
                            className="object-contain"
                          />
                          <button
                            type="button"
                            onClick={handleRemoveBack}
                            className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] font-semibold text-white hover:bg-black/90"
                          >
                            ✕
                          </button>
                          <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white ring-1 ring-white/20">
                            Verso
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                          Verso pendente
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800/60 text-[11px] font-semibold text-foreground ring-1 ring-border">
                      DOC
                    </div>
                    <div className="flex flex-col gap-1 text-center text-[12px] leading-tight">
                      <span className="font-medium text-foreground">
                        Enviar documento
                      </span>
                      <span className="text-muted-foreground">
                        Frente e verso • obrigatório
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-[14px] leading-relaxed text-muted-foreground">
                • Documento precisa estar visível e legível.
                <br />
                • Não utilize filtro ou edição pesada.
              </div>
            </div>

            <Separator />

            {/* SELFIE / PROVA DE VIDA VIA QRCODE */}
            <div className="grid gap-2 pt-2">
              <div className="text-[16px] font-medium text-foreground">
                Selfie de verificação
              </div>

              <div className="text-[14px] leading-snug text-muted-foreground">
                Agora precisamos confirmar que você é realmente você.
                Aponte a câmera do seu celular para o QR abaixo e siga
                as instruções para validar seu rosto em tempo real.
              </div>

              <div
                className={cn(
                  "flex flex-col items-center justify-center",
                  "rounded-md border border-dashed border-neutral-700/80 bg-neutral-950/40",
                  "px-4 py-8 text-center transition-colors",
                  "hover:border-neutral-500/80 hover:bg-neutral-900/40"
                )}
              >
                <div className="relative flex h-[200px] w-[200px] items-center justify-center rounded-md bg-white overflow-hidden">
                  {/* estado 1: carregando token */}
                  {qrLoading && !selfiePreview && (
                    <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-neutral-800 text-[11px] font-semibold text-neutral-400 ring-1 ring-border">
                      Gerando QR...
                    </div>
                  )}

                  {/* estado 2: erro ao gerar token */}
                  {qrError && !selfiePreview && (
                    <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-neutral-800 text-center text-[11px] font-semibold text-red-400 ring-1 ring-border px-4 leading-relaxed">
                      {qrError}
                    </div>
                  )}

                  {/* estado 3: já temos selfie validada */}
                  {selfiePreview && (
                    <img
                      src={selfiePreview}
                      alt="Selfie capturada"
                      className="w-[200px] h-[200px] object-cover"
                    />
                  )}

                  {/* estado 4: mostrar QR normalmente */}
                  {!qrLoading && !qrError && !selfiePreview && qrUrl && (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                        qrUrl
                      )}`}
                      alt="QR code para verificação facial"
                      className="w-[190px] h-[190px] rounded-md ring-border bg-white object-contain"
                    />
                  )}

                  {/* fallback se nada deu certo */}
                  {!qrLoading && !qrError && !selfiePreview && !qrUrl && (
                    <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-neutral-800 text-[10px] font-semibold text-neutral-400 ring-1 ring-border">
                      QR CODE
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[13px] leading-relaxed text-muted-foreground">
                • Garanta boa iluminação e seu rosto totalmente visível.
                <br />
                • Não utilize óculos escuros, máscara ou boné cobrindo o rosto.
              </div>
            </div>
          </div>

          <DrawerFooter className="gap-2 px-4 pb-4 pt-0 sm:px-6">
            <Button
              size="sm"
              className={cn(
                "w-full cursor-pointer rounded-md bg-[#26FF59]/90 py-5 text-[14px] font-semibold text-black hover:bg-[#26FF59]",
                !(frontConfirmed && backConfirmed && selfiePreview) &&
                  "pointer-events-none cursor-not-allowed opacity-30"
              )}
              onClick={handleSubmitDocument}
              disabled={!(frontConfirmed && backConfirmed && selfiePreview)}
            >
              Enviar documento
            </Button>

            <DrawerClose asChild>
              <Button
                size="sm"
                variant="outline"
                className="w-full cursor-pointer rounded-md py-5 text-[14px] font-semibold"
              >
                Cancelar
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/* -------------------------------------------------
   Wrapper usado no /dash
-------------------------------------------------- */
export function VerifyDocumentsSection({
  user,
}: {
  user: {
    id: number;           // <-- IMPORTANTE agora
    name: string;
    email: string;
    cpfOrCnpj: string;
    phone: string;
  };
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <AlertPending onVerify={() => setOpen(true)} />

      <VerifyDocumentsDrawer
        open={open}
        onOpenChange={setOpen}
        user={user}
      />
    </>
  );
}

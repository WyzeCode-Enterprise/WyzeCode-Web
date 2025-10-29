"use client";

import * as React from "react";
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
   Hook simples pra detectar viewport "mobile"
-------------------------------------------------- */
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");

    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      const matches =
        (e as MediaQueryList).matches ?? (e as any).matches ?? false;
      setIsMobile(!!matches);
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
   LocalStorage helpers pra frente/verso documento
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

function saveImagesToLocalStorage(
  frontB64: string | null,
  backB64: string | null
) {
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
    console.warn("Erro removendo frente", err);
  }
}

function removeBackFromLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BACK_KEY);
  } catch (err) {
    console.warn("Erro removendo verso", err);
  }
}

/* -------------------------------------------------
   Cartão amarelo do dashboard
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
      className={cn(
        "relative w-full rounded-md border border-yellow-400/30 bg-[#050505] p-4 sm:p-5",
        "dark:border-yellow-400/30 dark:bg-[#1a1a1a]/60",
        className || ""
      )}
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
            etapa, sua conta permanece limitada ao Wyze Bank Pay e fica sujeita
            a limites de uso e possível retenção de saldo.
          </p>
        </div>

        {/* Botão mobile (dentro do card) */}
        <div className="sm:hidden">
          <button
            type="button"
            onClick={onVerify}
            className={cn(
              "w-full inline-flex cursor-pointer items-center justify-center rounded-md",
              "bg-yellow-400 px-6 py-2 text-[13px] font-semibold text-black",
              "hover:bg-yellow-300 active:scale-[0.99]",
              "focus:outline-none focus:ring-2 focus:ring-yellow-300/60 focus:ring-offset-0",
              "transition-all"
            )}
          >
            Verificar documentos
          </button>
        </div>
      </div>

      {/* Botão desktop (canto do card) */}
      <button
        type="button"
        onClick={onVerify}
        className={cn(
          "hidden sm:inline-flex",
          "absolute bottom-4 right-4",
          "cursor-pointer items-center justify-center rounded-md",
          "bg-yellow-400 px-6 py-2 text-[13px] font-semibold text-black",
          "hover:bg-yellow-300 active:scale-[0.99]",
          "focus:outline-none focus:ring-2 focus:ring-yellow-300/60 focus:ring-offset-0",
          "transition-all"
        )}
      >
        Verificar documentos
      </button>
    </section>
  );
}

/* -------------------------------------------------
   Modal de upload (frente/verso)
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

  // refs pros blob URLs
  const frontBlobRef = React.useRef<string | null>(null);
  const backBlobRef = React.useRef<string | null>(null);

  // ao abrir, carrega confirmados
  React.useEffect(() => {
    if (open) {
      setFrontPreview(initialFrontB64 || null);
      setBackPreview(initialBackB64 || null);
      setFrontFile(null);
      setBackFile(null);

      if (frontBlobRef.current) {
        URL.revokeObjectURL(frontBlobRef.current);
        frontBlobRef.current = null;
      }
      if (backBlobRef.current) {
        URL.revokeObjectURL(backBlobRef.current);
        backBlobRef.current = null;
      }
    }
  }, [open, initialFrontB64, initialBackB64]);

  // preview frente
  React.useEffect(() => {
    if (frontFile) {
      const url = URL.createObjectURL(frontFile);
      if (frontBlobRef.current) {
        URL.revokeObjectURL(frontBlobRef.current);
      }
      frontBlobRef.current = url;
      setFrontPreview(url);
    }
  }, [frontFile]);

  // preview verso
  React.useEffect(() => {
    if (backFile) {
      const url = URL.createObjectURL(backFile);
      if (backBlobRef.current) {
        URL.revokeObjectURL(backBlobRef.current);
      }
      backBlobRef.current = url;
      setBackPreview(url);
    }
  }, [backFile]);

  // cleanup final
  React.useEffect(() => {
    return () => {
      if (frontBlobRef.current) URL.revokeObjectURL(frontBlobRef.current);
      if (backBlobRef.current) URL.revokeObjectURL(backBlobRef.current);
    };
  }, []);

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

  function handleRemoveFrontClick(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) {
    e.stopPropagation();
    setFrontFile(null);
    setFrontPreview(null);
    if (frontBlobRef.current) {
      URL.revokeObjectURL(frontBlobRef.current);
      frontBlobRef.current = null;
    }
  }

  function handleRemoveBackClick(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) {
    e.stopPropagation();
    setBackFile(null);
    setBackPreview(null);
    if (backBlobRef.current) {
      URL.revokeObjectURL(backBlobRef.current);
      backBlobRef.current = null;
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999999] flex items-center justify-center bg-black/70 p-5"
      )}
      onMouseDown={onClose}
    >
      <div
        className={cn(
          "flex w-full max-w-[800px] flex-col gap-4 rounded-md border border-neutral-800 bg-[#0a0a0a] p-5 shadow-xl"
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <div className="text-[20px] font-semibold text-foreground">
            Enviar documento
          </div>
          <div className="text-[14px] leading-relaxed text-muted-foreground">
            Envie frente e verso do seu documento oficial com foto. Precisa
            estar nítido, sem corte e sem dedo cobrindo dado.
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
                <img
                  src={frontPreview}
                  alt="Frente documento"
                  className="absolute inset-0 h-full w-full object-contain"
                />
                <button
                  type="button"
                  onClick={handleRemoveFrontClick}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] font-semibold text-white hover:bg-black/90"
                >
                  ✕
                </button>
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
                if (f) {
                  setFrontFile(f);
                }
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
                <img
                  src={backPreview}
                  alt="Verso documento"
                  className="absolute inset-0 h-full w-full object-contain"
                />
                <button
                  type="button"
                  onClick={handleRemoveBackClick}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] font-semibold text-white hover:bg-black/90"
                >
                  ✕
                </button>
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
                if (f) {
                  setBackFile(f);
                }
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
            className="w-full cursor-pointer bg-[#0A0A0A] py-[1.375rem] text-[15px] font-semibold"
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
   Drawer principal (documento + selfie/QR)
-------------------------------------------------- */
function VerifyDocumentsDrawer({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  user?: {
    id: number;
    name: string;
    email: string;
    cpfOrCnpj: string;
    phone: string;
  };
}) {
  const isMobile = useIsMobile();

  // previews do doc
  const [frontConfirmed, setFrontConfirmed] = React.useState<string | null>(
    null
  );
  const [backConfirmed, setBackConfirmed] = React.useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);

  // ====== SELFIE / QR ======
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);
  const [sessionTicket, setSessionTicket] = React.useState<string | null>(null);

  const [qrLoading, setQrLoading] = React.useState(false);
  const [qrError, setQrError] = React.useState<string | null>(null);

  // selfie recebida via celular
  const [selfiePreview, setSelfiePreview] = React.useState<string | null>(null);

  // evita bootstrap duplicado (StrictMode, re-render, etc.)
  const bootstrappedRef = React.useRef(false);

  // carrega frente/verso salvos localmente ao abrir
  React.useEffect(() => {
    if (!open) return;
    const { front, back } = loadImagesFromLocalStorage();
    if (front) setFrontConfirmed(front);
    if (back) setBackConfirmed(back);
  }, [open]);

  // cria/renova sessão facial e QR
  const bootstrapQRSession = React.useCallback(async () => {
    if (selfiePreview) return; // se já tem selfie, não precisa QR

    try {
      setQrLoading(true);
      setQrError(null);

      const resp = await fetch("/api/qrface", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      const data = await resp.json();

      if (!resp.ok) {
        console.error("Erro bootstrapQRSession:", data);
        setQrError(data.error || "Erro ao gerar QR Code.");
        setQrLoading(false);
        return;
      }

      // caso o backend já tenha selfie capturada
      if (data.status === "face_captured" && data.selfie_b64) {
        setSelfiePreview((prev) => prev || data.selfie_b64);
        setQrLoading(false);
        return;
      }

      // sessão ativa -> atualiza ticket/url
      setSessionTicket(data.session || null);
      setQrUrl(data.url || null);

      setQrLoading(false);
    } catch (err: any) {
      console.error("Falha de rede ao gerar QR:", err);
      setQrError("Falha de rede ao gerar QR Code.");
      setQrLoading(false);
    }
  }, [selfiePreview]);

  // só roda bootstrap 1x POR ABERTURA do drawer
  React.useEffect(() => {
    if (!open) {
      bootstrappedRef.current = false;
      return;
    }

    if (bootstrappedRef.current) return;

    if (selfiePreview) {
      bootstrappedRef.current = true;
      return;
    }

    bootstrappedRef.current = true;
    bootstrapQRSession();
  }, [open, selfiePreview, bootstrapQRSession]);

  // polling da selfie
  React.useEffect(() => {
    if (!open) return;
    if (!sessionTicket) return;
    if (selfiePreview) return;

    const myTicket = sessionTicket;
    let intervalId: any;

    async function poll() {
      try {
        const res = await fetch(
          `/api/qrface?session=${encodeURIComponent(myTicket)}`,
          { method: "GET", cache: "no-store" }
        );
        const data = await res.json();

        if (!res.ok) {
          console.warn("Polling erro:", data.error);
          return;
        }

        // chegou selfie -> fixa e para polling
        if (data.status === "face_captured" && data.selfie_b64) {
          setSelfiePreview((prev) => prev || data.selfie_b64);
          return;
        }

        // sessão expirada sem selfie:
        // limpa ticket/url e gera outra sessão só UMA VEZ a partir daqui
        if (data.status === "expired" && !data.selfie_b64) {
          console.warn(
            "Sessão facial expirou sem selfie, regenerando sessão..."
          );

          setSessionTicket(null);
          setQrUrl(null);

          bootstrappedRef.current = false;
          bootstrapQRSession();
        }
      } catch (err) {
        console.warn("Polling falhou:", err);
      }
    }

    poll();
    intervalId = setInterval(poll, 2500);

    return () => {
      clearInterval(intervalId);
    };
  }, [open, sessionTicket, selfiePreview, bootstrapQRSession]);

  // helpers do modal
  function handleConfirmUpload(
    finalFrontB64: string | null,
    finalBackB64: string | null
  ) {
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

  // envio final (placeholder)
  function handleSubmitDocument() {
    console.log("Enviar para KYC:", {
      frente: frontConfirmed,
      verso: backConfirmed,
      selfiePreview,
      sessionTicket,
    });
  }

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
          <div className="group-data-[vaul-drawer-direction=bottom]/drawer-content:block mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full bg-[#050505]" />

          <DrawerHeader className="gap-1 px-4 sm:px-6">
            <DrawerTitle className="text-[20px] font-semibold text-foreground">
              Verificação de Identidade
            </DrawerTitle>
            <DrawerDescription className="text-[15px] leading-relaxed text-muted-foreground">
              Para liberar limites maiores (PIX, cartão etc.), confirme quem é
              você. Envie um documento oficial com foto e valide sua selfie em
              tempo real.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm sm:px-6">
            {/* DADOS PESSOAIS */}
            <div className="grid gap-4 text-[13px] leading-relaxed">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Nome completo
                  </label>
                  <input
                    readOnly
                    value={displayName}
                    className="w-full select-none rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    CPF / CNPJ
                  </label>
                  <input
                    readOnly
                    value={cpfOrCnpj}
                    className="w-full select-none rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    E-mail
                  </label>
                  <input
                    readOnly
                    value={email}
                    className="w-full break-all select-none rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Telefone
                  </label>
                  <input
                    readOnly
                    value={phone}
                    className="w-full select-none rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-2 text-[13px] font-medium text-muted-foreground outline-none cursor-default"
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
                  "group relative w-full cursor-pointer rounded-md border border-dashed border-neutral-700/80 bg-neutral-950/40 px-4 py-4 text-left outline-none transition-colors hover:border-neutral-500/80 hover:bg-neutral-900/40 focus:ring-2 focus:ring-neutral-600/50"
                )}
              >
                {frontConfirmed || backConfirmed ? (
                  <div className="grid w-full gap-4 sm:grid-cols-2">
                    {/* Frente */}
                    <div className="relative h-[160px] w-full overflow-hidden rounded-md bg-black ring-1 ring-border">
                      {frontConfirmed ? (
                        <>
                          <img
                            src={frontConfirmed}
                            alt="Frente confirmada"
                            className="absolute inset-0 h-full w-full object-contain"
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
                          <img
                            src={backConfirmed}
                            alt="Verso confirmada"
                            className="absolute inset-0 h-full w-full object-contain"
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
                • Documento precisa estar legível (sem blur / sem corte).
                <br />
                • Não use filtros pesados nem tampe informação.
              </div>
            </div>

            <Separator />

            {/* SELFIE / PROVA DE VIDA VIA QRCODE */}
            <div className="grid gap-2 pt-2">
              <div className="text-[16px] font-medium text-foreground">
                Selfie de verificação
              </div>

              <div className="text-[14px] leading-snug text-muted-foreground">
                Agora precisamos confirmar que você é realmente você. Aponte a
                câmera do seu celular para o QR abaixo e siga as instruções para
                validar seu rosto em tempo real.
              </div>

              <div
                className={cn(
                  "flex flex-col items-center justify-center",
                  "rounded-md border border-dashed border-neutral-700/80 bg-neutral-950/40 px-4 py-8 text-center transition-colors hover:border-neutral-500/80 hover:bg-neutral-900/40"
                )}
              >
                <div className="relative flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-md bg-white">
                  {/* estado 1: carregando sessão QR */}
                  {qrLoading && !selfiePreview && (
                    <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-neutral-800 text-[11px] font-semibold text-neutral-400 ring-1 ring-border">
                      Gerando QR...
                    </div>
                  )}

                  {/* estado 2: erro ao gerar sessão */}
                  {qrError && !selfiePreview && (
                    <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-neutral-800 px-4 text-center text-[11px] font-semibold leading-relaxed text-red-400 ring-1 ring-border">
                      {qrError}
                    </div>
                  )}

                  {/* estado 3: selfie já recebida */}
                  {selfiePreview && (
                    <img
                      src={selfiePreview}
                      alt="Selfie capturada"
                      className="h-[200px] w-[200px] object-cover"
                    />
                  )}

                  {/* estado 4: exibir QRCode */}
                  {!qrLoading && !qrError && !selfiePreview && qrUrl && (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                        qrUrl
                      )}`}
                      alt="QR code para verificação facial"
                      className="h-[190px] w-[190px] rounded-md bg-white object-contain ring-border"
                    />
                  )}

                  {/* fallback final se nada carregou */}
                  {!qrLoading && !qrError && !selfiePreview && !qrUrl && (
                    <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-neutral-800 text-[10px] font-semibold text-neutral-400 ring-1 ring-border">
                      QR CODE
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[13px] leading-relaxed text-muted-foreground">
                • Boa iluminação e rosto totalmente visível.
                <br />
                • Sem óculos escuros, máscara ou boné cobrindo o rosto.
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
                className="w-full cursor-pointer py-5 text-[14px] font-semibold"
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
   Wrapper section (alerta + drawer)
-------------------------------------------------- */
export function VerifyDocumentsSection({
  user,
}: {
  user: {
    id: number;
    name: string;
    email: string;
    cpfOrCnpj: string;
    phone: string;
  };
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <>
      <AlertPending
        onVerify={() => setDrawerOpen(true)}
        className="border-yellow-400/30 bg-[#050505]"
      />

      <VerifyDocumentsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        user={user}
      />
    </>
  );
}

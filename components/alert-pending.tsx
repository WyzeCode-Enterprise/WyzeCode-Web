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
   Hook simples pra detectar viewport "mobile"
   (pra decidir a direção do Drawer)
-------------------------------------------------- */
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");

    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      const matches = (e as MediaQueryList).matches ?? (e as any).matches;
      setIsMobile(!!matches);
    };

    // estado inicial
    handler(mq);

    // listeners modernos e fallback antigo (Safari)
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
   Persistência local (frente/verso do documento)
   - FRONT_KEY guarda a face frontal
   - BACK_KEY guarda o verso
   - Armazenado como base64 dataURL
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
   AlertPending
   - Card amarelo que aparece no dashboard principal
   - Fala "você precisa verificar seus documentos"
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
            etapa, sua conta permanece limitada ao Wyze Bank Pay e fica sujeita a
            limites de uso e possível retenção de saldo.
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

      {/* Botão desktop (absoluto no canto) */}
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
   UploadModal
   - Modal para subir frente/verso do documento
   - Mostra preview
   - Quando confirma -> converte pra base64 e devolve pro drawer
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

  // Quando o modal abre, reseta estados com o que já existe
  React.useEffect(() => {
    if (open) {
      setFrontPreview(initialFrontB64 || null);
      setBackPreview(initialBackB64 || null);
      setFrontFile(null);
      setBackFile(null);
    }
  }, [open, initialFrontB64, initialBackB64]);

  // preview local frente
  React.useEffect(() => {
    if (frontFile) {
      const url = URL.createObjectURL(frontFile);
      setFrontPreview(url);
    }
  }, [frontFile]);

  // preview local verso
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

    // se usuário trocou o arquivo frente agora -> converte o file
    if (frontFile) finalFrontB64 = await fileToBase64(frontFile);
    // senão reaproveita o que já tinha salvo
    else if (initialFrontB64) finalFrontB64 = initialFrontB64;

    // verso
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
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <div className="text-[20px] font-semibold text-foreground">
            Enviar documento
          </div>
          <div className="text-[14px] leading-relaxed text-muted-foreground">
            Envie frente e verso do seu documento oficial com foto.
            Precisa estar nítido, sem corte e sem dedo cobrindo dado.
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBackFile(null);
                    setBackPreview(null);
                  }}
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
   VerifyDocumentsDrawer
   - Drawer lateral / bottom com:
     • Dados do usuário
     • Documento frente/verso confirmados
     • QR code pra selfie
     • Polling em "tempo real"
   - Agora usando sessionTicket (JWT curto assinado)
     e NÃO mais qrToken.
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

  // Documento confirmado (base64 que vai pro KYC)
  const [frontConfirmed, setFrontConfirmed] = React.useState<string | null>(null);
  const [backConfirmed, setBackConfirmed] = React.useState<string | null>(null);

  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);

  // Selfie / QR session
  const [qrUrl, setQrUrl] = React.useState<string | null>(null); // URL que vai no QR (já inclui ?session=...)
  const [sessionTicket, setSessionTicket] = React.useState<string | null>(null); // JWT curto da sessão biométrica
  const [qrLoading, setQrLoading] = React.useState(false);
  const [qrError, setQrError] = React.useState<string | null>(null);

  // Selfie capturada pelo celular e já salva no backend
  const [selfiePreview, setSelfiePreview] = React.useState<string | null>(null);

  // 1. Quando o Drawer abre, carregar frente/verso do localStorage
  React.useEffect(() => {
    if (!open) return;
    const { front, back } = loadImagesFromLocalStorage();
    if (front) setFrontConfirmed(front);
    if (back) setBackConfirmed(back);
  }, [open]);

  // 2. Cria ou reusa sessão QR no servidor (POST /api/qrface)
  const bootstrapQRSession = React.useCallback(async () => {
    if (!user?.id) {
      setQrError("ID de usuário não disponível.");
      return;
    }

    try {
      setQrLoading(true);
      setQrError(null);

      // backend responde:
      // { success, session, url, selfie_b64, status }
      // session = sessionTicket (JWT assinado)
      const resp = await fetch("/api/qrface", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await resp.json();

      if (!resp.ok) {
        console.error("Erro bootstrapQRSession:", data);
        setQrError(data.error || "Erro ao gerar QR Code.");
        setQrLoading(false);
        return;
      }

      setSessionTicket(data.session || null); // salva ticket pra polling
      setQrUrl(data.url || null);             // essa URL vai virar o QR visual

      // se o servidor já tem selfie capturada, já mostra direto
      if (data.status === "face_captured" && data.selfie_b64) {
        setSelfiePreview(data.selfie_b64);
      }

      setQrLoading(false);
    } catch (err: any) {
      console.error("Falha de rede ao gerar QR:", err);
      setQrError("Falha de rede ao gerar QR Code.");
      setQrLoading(false);
    }
  }, [user?.id]);

  // 3. Toda vez que o Drawer abrir, garantir que existe uma sessão QR ativa
  React.useEffect(() => {
    if (!open) return;
    bootstrapQRSession();
  }, [open, bootstrapQRSession]);

  // 4. Polling em tempo real enquanto o drawer está aberto
  //    - usa sessionTicket (JWT curto) e chama GET /api/qrface?session=...
  //    - se status mudar pra face_captured, atualiza selfiePreview
  //    - se status virar expired sem selfie, recria sessão automaticamente
  React.useEffect(() => {
    if (!open) return;
    if (!sessionTicket) return;
    if (selfiePreview) return; // já temos a selfie -> não precisa mais polling

    const myTicket = sessionTicket;
    let intervalId: any;

    async function poll() {
      try {
        const res = await fetch(
          `/api/qrface?session=${encodeURIComponent(myTicket)}`,
          { method: "GET" }
        );
        const data = await res.json();

        if (!res.ok) {
          console.warn("Polling erro:", data.error);
          return;
        }

        // chegou selfie → trava
        if (data.status === "face_captured" && data.selfie_b64) {
          setSelfiePreview(data.selfie_b64);
          return;
        }

        // expirou sem selfie → gera outra sessão nova automaticamente
        if (data.status === "expired" && !data.selfie_b64) {
          console.warn("Sessão expirou sem selfie, criando outra...");
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

  // ------------------------
  // Handlers de upload modal
  // ------------------------
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

  // 5. Envio final pro KYC
  //    Aqui é onde você chamará SUA rota final tipo /api/kyc/submit
  //    com os dados: documento frente/verso, selfie e o sessionTicket
  //    (pra rastrear qual sessão biométrica gerou aquela selfie).
  function handleSubmitDocument() {
    console.log("Enviar para KYC:", {
      documento_frente_b64: frontConfirmed,
      documento_verso_b64: backConfirmed,
      selfie_b64: selfiePreview,
      face_session_ticket: sessionTicket, // importante para backend linkar a selfie
      user_id: user?.id,
    });

    // TODO:
    // fetch("/api/kyc/submit", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     userId: user?.id,
    //     front: frontConfirmed,
    //     back: backConfirmed,
    //     selfie: selfiePreview,
    //     sessionTicket,
    //   }),
    // });
  }

  // Evita fechar o drawer no meio do modal de upload
  function handleDrawerOpenChange(next: boolean) {
    if (!next && uploadModalOpen) return;
    onOpenChange(next);
  }

  // dados básicos do usuário só pra exibir (read-only)
  const displayName = user?.name || "Usuário";
  const cpfOrCnpj = user?.cpfOrCnpj || "—";
  const email = user?.email || "indisponível@wyzebank.com";
  const phone = user?.phone || "—";

  return (
    <>
      {/* Modal de upload (sobrepõe tudo) */}
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
            // bottom sheet (mobile)
            "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
            // right sheet (desktop)
            "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-[90vw] data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-md data-[vaul-drawer-direction=right]:lg:max-w-lg",
            // left (caso você use em outro ponto)
            "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-[90vw] data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-md data-[vaul-drawer-direction=left]:lg:max-w-lg",
            // top (caso um dia use invertido)
            "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b"
          )}
        >
          {/* puxador mobile */}
          <div className="group-data-[vaul-drawer-direction=bottom]/drawer-content:block bg-[#050505] mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full" />

          <DrawerHeader className="gap-1 px-4 sm:px-6">
            <DrawerTitle className="text-[20px] font-semibold text-foreground">
              Verificação de Identidade
            </DrawerTitle>
            <DrawerDescription className="text-[15px] leading-relaxed text-muted-foreground">
              Para liberar limites maiores (PIX, cartão etc.), confirme quem é você.
              Envie um documento oficial com foto e valide sua selfie em tempo real.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm sm:px-6">
            {/* =========================
                DADOS PESSOAIS (somente leitura)
               ========================= */}
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

            {/* =========================
                DOCUMENTO (frente/verso)
               ========================= */}
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
                • Documento precisa estar legível (sem blur / sem corte).
                <br />
                • Não use filtros pesados nem tampe informação.
              </div>
            </div>

            <Separator />

            {/* =========================
                SELFIE / PROVA DE VIDA VIA QR
               ========================= */}
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
                  {/* estado 1: carregando sessão QR */}
                  {qrLoading && !selfiePreview && (
                    <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-neutral-800 text-[11px] font-semibold text-neutral-400 ring-1 ring-border">
                      Gerando QR...
                    </div>
                  )}

                  {/* estado 2: erro ao gerar sessão */}
                  {qrError && !selfiePreview && (
                    <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-neutral-800 text-center text-[11px] font-semibold text-red-400 ring-1 ring-border px-4 leading-relaxed">
                      {qrError}
                    </div>
                  )}

                  {/* estado 3: selfie já recebida */}
                  {selfiePreview && (
                    <img
                      src={selfiePreview}
                      alt="Selfie capturada"
                      className="w-[200px] h-[200px] object-cover"
                    />
                  )}

                  {/* estado 4: exibir QRCode (usando API externa simples pra gerar imagem) */}
                  {!qrLoading && !qrError && !selfiePreview && qrUrl && (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                        qrUrl
                      )}`}
                      alt="QR code para verificação facial"
                      className="w-[190px] h-[190px] rounded-md ring-border bg-white object-contain"
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

          {/* =========================
              FOOTER (botões)
             ========================= */}
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
   VerifyDocumentsSection
   - Componente que você coloca no dashboard
   - Renderiza o alerta amarelo + drawer
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
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <AlertPending onVerify={() => setOpen(true)} />

      <VerifyDocumentsDrawer open={open} onOpenChange={setOpen} user={user} />
    </>
  );
}

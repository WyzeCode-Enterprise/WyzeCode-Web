"use client";

import React, { useEffect, useRef, useState } from "react";

export default function QRFacePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [token, setToken] = useState<string | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [streamReady, setStreamReady] = useState(false);

  const [capturing, setCapturing] = useState(false);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // pega token da URL (?wzb_token=...)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("wzb_token");
    setToken(t || null);
  }, []);

  // abre câmera frontal
  useEffect(() => {
    async function openCamera() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "user" }, // tenta frontal
            width: { ideal: 720 },
            height: { ideal: 1280 },
          },
          audio: false,
        });

        setStream(media);

        // injeta o stream no <video>
        if (videoRef.current) {
          videoRef.current.srcObject = media;
        }
      } catch (err) {
        console.error("Erro ao acessar câmera:", err);
        setErrorMsg(
          "Não foi possível acessar a câmera. Verifique permissões e conexão segura (https)."
        );
      }
    }

    openCamera();

    // cleanup: parar camera quando sair da página
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
    // importante: depende de `stream`
  }, [stream]);

    // garantir que o vídeo realmente dê play depois que metadados carregarem
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleLoadedMetadata = () => {
      if (!videoEl) return; // TS fica feliz + evita edge case

      // tenta dar play programaticamente
      videoEl
        .play()
        .then(() => {
          setStreamReady(true);
        })
        .catch((err) => {
          console.warn("Falha ao dar play no vídeo:", err);
          // alguns browsers só liberam depois de interação manual do usuário
          setStreamReady(false);
        });
    };

    videoEl.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      videoEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, []);

  // captura frame atual e envia pro backend
  async function handleCaptureAndSend() {
    if (!videoRef.current || !canvasRef.current || !token || done) return;

    setCapturing(true);
    setErrorMsg(null);

    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;

    // pega resolução real do stream
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;

    // fallback caso browser ainda não atualizou metadata
    if (!w || !h) {
      setCapturing(false);
      setErrorMsg("Câmera ainda inicializando. Tente de novo em 1 segundo.");
      return;
    }

    canvasEl.width = w;
    canvasEl.height = h;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
      setCapturing(false);
      setErrorMsg("Erro interno de captura.");
      return;
    }

    // espelhar horizontal (selfie)
    ctx.save();
    ctx.scale(-1, 1); // espelha no eixo X
    ctx.drawImage(videoEl, -w, 0, w, h); // desenha invertido
    ctx.restore();

    // pega base64
    const dataUrl = canvasEl.toDataURL("image/jpeg", 0.9);

    try {
      const resp = await fetch("/api/qrface", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          selfieDataUrl: dataUrl,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        console.error("Falha ao enviar selfie:", data);
        setErrorMsg(data.error || "Falha ao enviar a selfie.");
        setCapturing(false);
        return;
      }

      // sucesso
      setSelfiePreview(data.selfiePreview || dataUrl);
      setDone(true);
    } catch (err: any) {
      console.error("Erro de rede:", err);
      setErrorMsg("Erro de rede ao enviar selfie.");
    } finally {
      setCapturing(false);
    }
  }

  // layout visual
  // - container maior (320x400) pra parecer câmera vertical/rosto
  // - moldura de rosto com glow verde (#26FF59)
  // - overlay escurecendo fora do rosto + instruções
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[radial-gradient(circle_at_20%_20%,#1a1a1a_0%,#000000_70%)] text-white p-6">
      <div className="w-full max-w-[22rem] flex flex-col items-center gap-6 text-center">
        {/* topo: título e instruções */}
        <header className="flex flex-col gap-2">
          <h1 className="text-[1.1rem] font-semibold text-white tracking-tight">
            Verificação de rosto
          </h1>
          <p className="text-[0.85rem] text-white/70 leading-relaxed">
            Enquadre seu rosto dentro da área destacada e toque em{" "}
            <strong className="text-white font-medium">Capturar</strong>.
          </p>
        </header>

        {/* bloco principal (câmera OU selfie enviada) */}
        {selfiePreview ? (
          <div className="relative w-[320px] max-w-full h-[400px] rounded-2xl overflow-hidden ring-2 ring-[#26FF59]/60 shadow-[0_0_40px_#26FF5966] bg-neutral-900 flex items-center justify-center">
            <img
              src={selfiePreview}
              alt="Sua selfie enviada"
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-center text-[0.7rem] py-2 text-white font-medium">
              Selfie enviada com sucesso
            </div>
          </div>
        ) : (
          <>
            {/* preview da câmera */}
            <div className="relative w-[320px] max-w-full h-[400px] flex items-center justify-center rounded-2xl overflow-hidden ring-1 ring-white/10 bg-black">
              {/* vídeo ESPELHADO pra parecer selfie */}
              <video
                ref={videoRef}
                className="
                  absolute inset-0 w-full h-full object-cover
                  [transform:scaleX(-1)]
                "
                // atributos que ajudam mobile/iOS liberar autoplay de câmera frontal
                playsInline
                autoPlay
                muted
              />

              {/* máscara de rosto */}
              {/* a ideia: uma forma oval/rosto com queixo mais fechado.
                  Fazemos com div pseudo-oval e um gradiente radial pra escurecer o resto */}
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                aria-hidden="true"
              >
                {/* contorno verde brilhando */}
                <div
                  className="
                    relative
                    w-[220px] h-[300px]
                    rounded-[46%_46%_40%_40%/50%_50%_60%_60%]
                    border-2 border-[#26FF59]
                    shadow-[0_0_25px_rgba(38,255,89,0.4),0_0_60px_rgba(38,255,89,0.15)]
                  "
                >
                  {/* sombra escura fora do rosto (um gradiente radial maior) */}
                  <div
                    className="
                      absolute -inset-[80px]
                      rounded-[46%_46%_40%_40%/50%_50%_60%_60%]
                      pointer-events-none
                    "
                    style={{
                      background:
                        "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.7) 70%)",
                    }}
                  />
                </div>
              </div>

              {/* instruções dentro da view */}
              {!streamReady && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[0.7rem] text-white/80 py-2 px-3 leading-snug">
                  Ativando câmera...
                </div>
              )}
            </div>

            {/* canvas escondido pra capturar frame */}
            <canvas ref={canvasRef} className="hidden" />
          </>
        )}

        {/* mensagem de erro */}
        {errorMsg && (
          <div className="text-red-400 text-[0.75rem] leading-relaxed px-4">
            {errorMsg}
          </div>
        )}

        {/* botão de ação */}
        {!selfiePreview && (
          <button
            onClick={handleCaptureAndSend}
            disabled={!streamReady || capturing || !token}
            className={[
              "w-full rounded-md py-3 text-[0.9rem] font-semibold tracking-[-0.02em]",
              "bg-[#26FF59] text-black shadow-[0_0_20px_rgba(38,255,89,0.6)]",
              "active:scale-[0.99] transition-all",
              "disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none",
            ].join(" ")}
          >
            {capturing ? "Enviando..." : "Capturar e enviar"}
          </button>
        )}

        {selfiePreview && (
          <div className="text-center text-[0.8rem] text-white/70 leading-relaxed px-4">
            Você já enviou sua selfie. Pode fechar esta tela.
          </div>
        )}

        {/* rodapé instruções */}
        <footer className="text-[0.7rem] text-white/40 text-center leading-relaxed max-w-[240px]">
          Luz clara e rosto totalmente visível. Sem óculos escuros, boné ou
          máscara cobrindo o rosto.
        </footer>
      </div>
    </main>
  );
}

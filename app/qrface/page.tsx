"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

export default function QRFacePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // token que veio no link do QR (?wzb_token=...)
  const [token, setToken] = useState<string | null>(null);

  // stream de câmera
  const [stream, setStream] = useState<MediaStream | null>(null);

  // estado geral da câmera
  const [cameraReady, setCameraReady] = useState(false); // vídeo tocando
  const [askingPermission, setAskingPermission] = useState(false); // enquanto tenta abrir
  const [permissionAsked, setPermissionAsked] = useState(false); // já clicou no botão "Ativar câmera" pelo menos uma vez?

  // envio da selfie
  const [capturing, setCapturing] = useState(false);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // mensagens
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // pega token da URL quando a página monta
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("wzb_token");
    setToken(t || null);
  }, []);

  // função que pede permissão e abre a câmera frontal
  const requestCameraAccess = useCallback(async () => {
    if (askingPermission) return;
    setErrorMsg(null);
    setAskingPermission(true);
    setPermissionAsked(true);

    try {
      // pede câmera frontal
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" }, // frontal
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: false,
      });

      setStream(media);

      // joga stream no <video>
      if (videoRef.current) {
        videoRef.current.srcObject = media;
      }

      // vamos tentar tocar o vídeo assim que ele tiver metadata
      const videoEl = videoRef.current;
      if (videoEl) {
        const handleLoadedMetadata = () => {
          // tenta dar play programaticamente
          videoEl
            .play()
            .then(() => {
              setCameraReady(true);
            })
            .catch((err) => {
              console.warn("Falha ao dar play no vídeo:", err);
              // alguns browsers só liberam depois que o user toca manualmente,
              // mas a essa altura já temos stream, então só avisamos
              setCameraReady(false);
              setErrorMsg(
                "Toque na prévia de vídeo para iniciar a câmera se ela não começar sozinha."
              );
            });
        };

        // se já carregou metadata, chama direto.
        if (videoEl.readyState >= 1) {
          handleLoadedMetadata();
        } else {
          videoEl.addEventListener("loadedmetadata", handleLoadedMetadata, {
            once: true,
          });
        }
      }
    } catch (err) {
      console.error("Erro ao acessar câmera:", err);
      setErrorMsg(
        "Não foi possível usar a câmera. Ative as permissões do navegador e tente novamente."
      );
      setCameraReady(false);
    } finally {
      setAskingPermission(false);
    }
  }, [askingPermission]);

  // cleanup: parar a câmera ao desmontar
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stream]);

  // captura frame atual e envia para o backend
  async function handleCaptureAndSend() {
    if (!videoRef.current || !canvasRef.current || !token || done) return;

    setCapturing(true);
    setErrorMsg(null);

    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;

    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;

    // Browser ainda sem metadata?
    if (!w || !h) {
      setCapturing(false);
      setErrorMsg("Câmera ainda inicializando. Tente de novo.");
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

    // espelhar horizontal pra parecer selfie (câmera frontal é espelhada)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, -w, 0, w, h);
    ctx.restore();

    // gera base64 (JPEG ~ alta qualidade)
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

      // sucesso: mostramos o preview final e travamos a tela
      setSelfiePreview(data.selfiePreview || dataUrl);
      setDone(true);
    } catch (err) {
      console.error("Erro de rede:", err);
      setErrorMsg("Erro de rede ao enviar selfie.");
    } finally {
      setCapturing(false);
    }
  }

  // --- UI helpers -------------------------------------------------------

  // status que aparece sobre o vídeo enquanto a câmera não está ativa
  function renderCameraStatusOverlay() {
    // já tirou selfie? então não mostra overlay
    if (selfiePreview) return null;

    // se a câmera está visível e tocando, não mostra overlay
    if (cameraReady) return null;

    // se ainda nem pediu permissão
    if (!permissionAsked) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[0.75rem] leading-snug text-white/90 py-2 px-3">
          Toque em "Ativar câmera" para começar.
        </div>
      );
    }

    // pediu permissão mas ainda está iniciando
    if (askingPermission) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[0.75rem] leading-snug text-white/90 py-2 px-3">
          Abrindo câmera...
        </div>
      );
    }

    // tentou abrir mas não ficou ready automaticamente
    return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[0.75rem] leading-snug text-white/90 py-2 px-3">
          Se a câmera estiver preta, toque na prévia para liberar o vídeo.
        </div>
    );
  }

  // máscara de rosto tipo "oval de selfie", com glow verde
  function FaceMaskOverlay() {
    if (selfiePreview) return null;

    return (
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        {/* container da moldura/rosto */}
        <div className="relative w-[220px] h-[300px]">
          {/* contorno com glow verde */}
          <div
            className="
              absolute inset-0
              rounded-[46%_46%_40%_40%/50%_50%_60%_60%]
              border-2 border-[#26FF59]
              shadow-[0_0_30px_rgba(38,255,89,0.55),0_0_70px_rgba(38,255,89,0.25)]
            "
          />

          {/* sombra escura DO LADO DE FORA do rosto */}
          {/* truque: pseudo "vignette" radial só que recortado na mesma shape */}
          <div
            className="
              absolute -inset-[100px]
              rounded-[46%_46%_40%_40%/50%_50%_60%_60%]
              pointer-events-none
            "
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 70%)",
            }}
          />
        </div>
      </div>
    );
  }

  // bloco principal (câmera ou selfie final)
  function renderCameraBlock() {
    // se já enviou selfie, mostra o resultado final com borda verde
    if (selfiePreview) {
      return (
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
      );
    }

    // caso normal: preview da câmera
    return (
      <div className="relative w-[320px] max-w-full h-[400px] flex items-center justify-center rounded-2xl overflow-hidden ring-1 ring-white/10 bg-black">
        <video
          ref={videoRef}
          className="
            absolute inset-0 w-full h-full object-cover
            [transform:scaleX(-1)]
          "
          playsInline
          autoPlay
          muted
        />

        <FaceMaskOverlay />
        {renderCameraStatusOverlay()}
      </div>
    );
  }

  // botão principal (ou mensagem final)
  function renderActionArea() {
    // já enviou selfie
    if (selfiePreview) {
      return (
        <div className="text-center text-[0.8rem] text-white/70 leading-relaxed px-4">
          Você já enviou sua selfie. Pode fechar esta tela.
        </div>
      );
    }

    // se ainda não pedimos permissão pra câmera
    if (!permissionAsked) {
      return (
        <button
          onClick={requestCameraAccess}
          disabled={askingPermission || !token}
          className={[
            "w-full rounded-md py-3 text-[0.9rem] font-semibold tracking-[-0.02em]",
            "bg-[#26FF59] text-black shadow-[0_0_20px_rgba(38,255,89,0.6)]",
            "active:scale-[0.99] transition-all",
            "disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none",
          ].join(" ")}
        >
          {askingPermission ? "Solicitando acesso..." : "Ativar câmera"}
        </button>
      );
    }

    // já pedimos permissão e (talvez) a câmera está ativa
    return (
      <button
        onClick={handleCaptureAndSend}
        disabled={!cameraReady || capturing || !token}
        className={[
          "w-full rounded-md py-3 text-[0.9rem] font-semibold tracking-[-0.02em]",
          "bg-[#26FF59] text-black shadow-[0_0_20px_rgba(38,255,89,0.6)]",
          "active:scale-[0.99] transition-all",
          "disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none",
        ].join(" ")}
      >
        {capturing ? "Enviando..." : "Capturar e enviar"}
      </button>
    );
  }

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[radial-gradient(circle_at_20%_20%,#1a1a1a_0%,#000000_70%)] text-white p-6">
      <div className="w-full max-w-[22rem] flex flex-col items-center gap-6 text-center">
        {/* Header */}
        <header className="flex flex-col gap-2">
          <h1 className="text-[1.1rem] font-semibold text-white tracking-tight">
            Verificação de rosto
          </h1>
          <p className="text-[0.85rem] text-white/70 leading-relaxed">
            Enquadre seu rosto dentro da área destacada.
            Quando estiver pronto, toque em
            <strong className="text-white font-medium"> Capturar</strong>.
          </p>
        </header>

        {/* Bloco da câmera / selfie final */}
        {renderCameraBlock()}

        {/* Canvas escondido pra captura do frame */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Mensagem de erro */}
        {errorMsg && (
          <div className="text-red-400 text-[0.75rem] leading-relaxed px-4">
            {errorMsg}
          </div>
        )}

        {/* CTA */}
        {renderActionArea()}

        {/* Rodapé instruções */}
        <footer className="text-[0.7rem] text-white/40 text-center leading-relaxed max-w-[240px]">
          Luz clara, rosto totalmente visível.
          Sem óculos escuros, máscara ou boné cobrindo o rosto.
        </footer>
      </div>
    </main>
  );
}

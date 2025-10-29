"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Tela que abre no celular depois que o usuário escaneia o QR.
 * Passos:
 *  - Lemos ?wzb_token=... da URL
 *  - Usuário clica "Ativar câmera"
 *  - Pedimos getUserMedia
 *    - tentamos frontal (facingMode: "user")
 *    - se falhar, tentamos sem facingMode (fallback)
 *  - Mostramos preview espelhado (selfie)
 *  - Quando clica "Capturar e enviar", tiramos um frame e mandamos pro PUT /api/qrface
 *  - Se deu certo, travamos a tela e exibimos a foto enviada
 */

export default function QRFacePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // token do link (?wzb_token=...)
  const [token, setToken] = useState<string | null>(null);

  // controle da câmera
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraTryingPlay, setCameraTryingPlay] = useState(false);

  // permissão
  const [askingPermission, setAskingPermission] = useState(false);
  const [permissionAsked, setPermissionAsked] = useState(false);

  // envio da selfie
  const [capturing, setCapturing] = useState(false);
  const [done, setDone] = useState(false);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  // mensagens visuais
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // pega o token da URL
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get("wzb_token");
      setToken(t || null);
    } catch (err) {
      console.error("Falha lendo token da URL:", err);
      setToken(null);
      setErrorMsg("Link inválido.");
    }
  }, []);

  // função interna que configura o <video> depois de conseguir o stream
  const attachStreamToVideo = useCallback(async (media: MediaStream) => {
    if (!videoRef.current) return;

    // bota o stream no elemento
    videoRef.current.srcObject = media;

    // tenta tocar quando o metadata estiver pronto
    const videoEl = videoRef.current;

    const tryPlay = () => {
      setCameraTryingPlay(true);
      videoEl
        .play()
        .then(() => {
          setCameraReady(true);
          setCameraTryingPlay(false);
        })
        .catch((err) => {
          console.warn("Falha ao dar play no vídeo:", err);
          // iOS Safari pode exigir toque manual no vídeo pra dar play
          setCameraReady(false);
          setCameraTryingPlay(false);
          setErrorMsg(
            "Toque na prévia de vídeo para iniciar a câmera se ela não começar sozinha."
          );
        });
    };

    if (videoEl.readyState >= 1) {
      tryPlay();
    } else {
      const onLoadedMetadata = () => {
        videoEl.removeEventListener("loadedmetadata", onLoadedMetadata);
        tryPlay();
      };
      videoEl.addEventListener("loadedmetadata", onLoadedMetadata);
    }
  }, []);

  // pedir permissão de câmera
  const requestCameraAccess = useCallback(async () => {
    if (askingPermission || capturing || done) return;
    setErrorMsg(null);
    setAskingPermission(true);
    setPermissionAsked(true);

    async function getMediaFrontFirstThenFallback() {
      // 1ª tentativa: câmera frontal
      try {
        const mediaFront = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 720 },
            height: { ideal: 1280 },
          },
          audio: false,
        });
        return mediaFront;
      } catch {
        // falhou frontal (às vezes no desktop / alguns android)
      }

      // fallback: qualquer câmera disponível
      const mediaAny = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      return mediaAny;
    }

    try {
      if (!token) {
        setErrorMsg("Link inválido (token ausente).");
        setAskingPermission(false);
        return;
      }

      const media = await getMediaFrontFirstThenFallback();
      setStream(media);

      await attachStreamToVideo(media);
    } catch (err) {
      console.error("Erro ao acessar câmera:", err);
      setCameraReady(false);

      // checa se HTTPS pode ser o problema
      const insecure =
        typeof window !== "undefined" &&
        window.location.protocol !== "https:" &&
        window.location.hostname !== "localhost";

      if (insecure) {
        setErrorMsg(
          "Navegador bloqueou a câmera porque a conexão não é segura. Abra este link em HTTPS."
        );
      } else {
        setErrorMsg(
          "Não foi possível usar a câmera. Verifique permissões do navegador."
        );
      }
    } finally {
      setAskingPermission(false);
    }
  }, [askingPermission, capturing, done, token, attachStreamToVideo]);

  // cleanup: parar câmera quando sai da página
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stream]);

  // o usuário pode tocar manualmente no vídeo pra tentar play() de novo
  function handleManualPlay() {
    if (!videoRef.current) return;
    if (cameraReady) return;

    setCameraTryingPlay(true);
    videoRef.current
      .play()
      .then(() => {
        setCameraReady(true);
        setCameraTryingPlay(false);
      })
      .catch((err) => {
        console.warn("Still can't play:", err);
        setCameraTryingPlay(false);
      });
  }

  // captura frame atual e envia para o backend
  async function handleCaptureAndSend() {
    if (done) return;
    if (!cameraReady) {
      setErrorMsg("Câmera ainda não está pronta.");
      return;
    }
    if (!videoRef.current || !canvasRef.current) {
      setErrorMsg("Câmera indisponível.");
      return;
    }
    if (!token) {
      setErrorMsg("Token inválido.");
      return;
    }

    setCapturing(true);
    setErrorMsg(null);

    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;

    // resolução real do frame
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;

    if (!w || !h) {
      setCapturing(false);
      setErrorMsg("Câmera ainda inicializando, tente de novo.");
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

    // espelha horizontal (estética selfie)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, -w, 0, w, h);
    ctx.restore();

    // extrai JPEG base64
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

      // segurança: para a câmera quando finaliza
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (err) {
      console.error("Erro de rede:", err);
      setErrorMsg("Erro de rede ao enviar selfie.");
    } finally {
      setCapturing(false);
    }
  }

  // ---------------- UI helpers ----------------

  function FaceMaskOverlay() {
    // não mostrar overlay se já finalizou
    if (selfiePreview) return null;

    return (
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="relative w-[220px] h-[300px]">
          {/* Moldura verde com glow (formato rosto alongado) */}
          <div
            className="
              absolute inset-0
              rounded-[46%_46%_40%_40%/50%_50%_60%_60%]
              border-2 border-[#26FF59]
              shadow-[0_0_30px_rgba(38,255,89,0.55),0_0_70px_rgba(38,255,89,0.25)]
            "
          />

          {/* Vinheta escura fora do rosto */}
          <div
            className="
              absolute -inset-[100px]
              rounded-[46%_46%_40%_40%/50%_50%_60%_60%]
              pointer-events-none
            "
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.8) 70%)",
            }}
          />
        </div>
      </div>
    );
  }

  function renderCameraStatusOverlay() {
    if (selfiePreview) return null;
    if (cameraReady) return null;

    // Nunca pediu permissão ainda
    if (!permissionAsked) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[0.75rem] text-white/90 py-2 px-3 leading-snug">
          Toque em "Ativar câmera" para começar.
        </div>
      );
    }

    // Pedindo permissão agora
    if (askingPermission) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[0.75rem] text-white/90 py-2 px-3 leading-snug">
          Abrindo câmera...
        </div>
      );
    }

    // Já pediu, mas autoplay falhou
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[0.75rem] text-white/90 py-2 px-3 leading-snug">
        {cameraTryingPlay
          ? "Tentando iniciar fluxo de vídeo..."
          : "Se a câmera estiver preta, toque no vídeo para liberar."}
      </div>
    );
  }

  function renderCameraBlock() {
    // Já finalizado → mostra selfie enviada em destaque
    if (selfiePreview) {
      return (
        <div className="relative w-[320px] max-w-full h-[400px] rounded-2xl overflow-hidden ring-2 ring-[#26FF59]/60 shadow-[0_0_40px_#26FF5966] bg-neutral-900 flex items-center justify-center">
          <img
            src={selfiePreview}
            alt="Selfie enviada"
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-center text-[0.7rem] py-2 text-white font-medium">
            Selfie enviada com sucesso
          </div>
        </div>
      );
    }

    // Pré-captura → preview da câmera
    return (
      <div className="relative w-[320px] max-w-full h-[400px] flex items-center justify-center rounded-2xl overflow-hidden ring-1 ring-white/10 bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover [transform:scaleX(-1)]"
          playsInline
          autoPlay
          muted
          onClick={handleManualPlay} // iOS: user tap para tentar play
        />
        <FaceMaskOverlay />
        {renderCameraStatusOverlay()}
      </div>
    );
  }

  function renderActionArea() {
    // finalizado
    if (selfiePreview) {
      return (
        <div className="text-center text-[0.8rem] text-white/70 leading-relaxed px-4">
          Pronto! Você já enviou sua selfie. Pode fechar esta tela.
        </div>
      );
    }

    // ainda não pediu permissão
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

    // permissão já pedida → botão de capturar
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
        <header className="flex flex-col gap-2">
          <h1 className="text-[1.1rem] font-semibold text-white tracking-tight">
            Verificação facial
          </h1>
          <p className="text-[0.85rem] text-white/70 leading-relaxed">
            Enquadre seu rosto dentro da área destacada. Quando estiver pronto,
            toque em <strong className="text-white font-medium">Capturar</strong>.
          </p>
        </header>

        {renderCameraBlock()}

        {/* canvas escondido que a gente usa só na captura */}
        <canvas ref={canvasRef} className="hidden" />

        {errorMsg && (
          <div className="text-red-400 text-[0.75rem] leading-relaxed px-4">
            {errorMsg}
          </div>
        )}

        {renderActionArea()}

        <footer className="text-[0.7rem] text-white/40 text-center leading-relaxed max-w-[240px]">
          Iluminação clara. Rosto totalmente visível. Sem óculos escuros,
          boné ou máscara cobrindo o rosto.
        </footer>
      </div>
    </main>
  );
}

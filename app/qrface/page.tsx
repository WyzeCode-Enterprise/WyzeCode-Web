"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type TokenStatus =
  | "unknown"
  | "pending_face"
  | "face_captured"
  | "expired"
  | "blocked"
  | "validated";

export default function QRFacePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // sessionTicket que veio no link (?session=...)
  const [sessionTicket, setSessionTicket] = useState<string | null>(null);

  // status da sessão (pending_face, face_captured, expired...)
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("unknown");

  // preview da selfie já recebida (servidor ou local)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  // câmera
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraTryingPlay, setCameraTryingPlay] = useState(false);

  // permissão de câmera
  const [askingPermission, setAskingPermission] = useState(false);
  const [permissionAsked, setPermissionAsked] = useState(false);

  // captura
  const [capturing, setCapturing] = useState(false);
  const [done, setDone] = useState(false);

  // mensagens
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Ler sessionTicket da URL e validar com backend
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const rawSession = sp.get("session");

      if (!rawSession) {
        setErrorMsg("Link inválido.");
        setTokenStatus("expired");
        setDone(true);
        return;
      }

      setSessionTicket(rawSession);

      // validar com backend
      (async () => {
        try {
          const res = await fetch(
            `/api/qrface?session=${encodeURIComponent(rawSession)}`
          );
          const data = await res.json();

          if (!res.ok) {
            setErrorMsg(
              data.error ||
                "Sessão inválida ou expirada. Gere um novo QR pelo app."
            );
            setTokenStatus("expired");
            setDone(true);
            return;
          }

          // status: pending_face | face_captured | expired ...
          setTokenStatus(data.status || "unknown");

          // se já capturada, já podemos exibir a selfie
          if (data.status === "face_captured" && data.selfie_b64) {
            setSelfiePreview(data.selfie_b64);
            setDone(true);
          }

          // se expirou, bloqueia
          if (data.status === "expired") {
            setErrorMsg("Esse QR expirou. Gere outro QR no app.");
            setDone(true);
          }
        } catch (netErr) {
          console.error("Erro ao validar sessão inicial:", netErr);
          setErrorMsg("Erro de rede. Abra o QR novamente no app.");
          setTokenStatus("expired");
          setDone(true);
        }
      })();
    } catch (err) {
      console.error("Falha lendo session da URL:", err);
      setErrorMsg("Link inválido.");
      setTokenStatus("expired");
      setDone(true);
    }
  }, []);

  // helper: colocar stream de câmera no <video> e tentar autoplay
  const attachStreamToVideo = useCallback(async (media: MediaStream) => {
    if (!videoRef.current) return;
    const videoEl = videoRef.current;

    videoEl.srcObject = media;

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
          // Safari iOS precisa de interação
          setCameraReady(false);
          setCameraTryingPlay(false);
          setErrorMsg(
            "Toque no vídeo para liberar a câmera se ela estiver preta."
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

  // solicitar acesso à câmera
  const requestCameraAccess = useCallback(async () => {
    if (askingPermission || capturing || done) return;
    if (!sessionTicket) return;

    if (tokenStatus !== "pending_face") {
      setErrorMsg("Esse QR não está mais ativo. Gere outro no app.");
      return;
    }

    setErrorMsg(null);
    setAskingPermission(true);
    setPermissionAsked(true);

    async function getMediaFrontFirstThenFallback() {
      try {
        // preferimos câmera frontal
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
        // fallback se frontal falhou (desktop, device estranho etc)
      }

      const mediaAny = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      return mediaAny;
    }

    try {
      const media = await getMediaFrontFirstThenFallback();
      setStream(media);
      await attachStreamToVideo(media);
    } catch (err) {
      console.error("Erro ao acessar câmera:", err);
      setCameraReady(false);

      const insecure =
        typeof window !== "undefined" &&
        window.location.protocol !== "https:" &&
        window.location.hostname !== "localhost";

      if (insecure) {
        setErrorMsg(
          "O navegador bloqueou a câmera porque a conexão não é segura. Abra este link em HTTPS."
        );
      } else {
        setErrorMsg(
          "Não foi possível acessar a câmera. Verifique permissões do navegador."
        );
      }
    } finally {
      setAskingPermission(false);
    }
  }, [
    askingPermission,
    capturing,
    done,
    sessionTicket,
    tokenStatus,
    attachStreamToVideo,
  ]);

  // parar câmera ao sair da página
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stream]);

  // tentativa manual de play() se o autoplay falhou
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
        console.warn("Ainda não conseguiu dar play():", err);
        setCameraTryingPlay(false);
      });
  }

  // capturar frame atual e enviar pro backend
  async function handleCaptureAndSend() {
    if (done) return;

    if (tokenStatus !== "pending_face") {
      setErrorMsg("Esse QR não está mais ativo. Gere outro no app.");
      return;
    }

    if (!cameraReady) {
      setErrorMsg("Câmera ainda não está pronta.");
      return;
    }
    if (!videoRef.current || !canvasRef.current) {
      setErrorMsg("Câmera indisponível.");
      return;
    }
    if (!sessionTicket) {
      setErrorMsg("Sessão ausente.");
      return;
    }

    setCapturing(true);
    setErrorMsg(null);

    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;

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

    // espelhar horizontal pra ficar estilo selfie
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, -w, 0, w, h);
    ctx.restore();

    const dataUrl = canvasEl.toDataURL("image/jpeg", 0.9);

    try {
      const resp = await fetch("/api/qrface", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: sessionTicket,
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

      // sucesso → selfie salva, sessão travada
      setSelfiePreview(data.selfiePreview || dataUrl);
      setTokenStatus("face_captured");
      setDone(true);

      // corta a câmera (privacidade)
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
    if (selfiePreview) return null;
    if (tokenStatus !== "pending_face") return null;

    return (
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="relative w-[220px] h-[300px]">
          {/* moldura verde com glow */}
          <div
            className="
              absolute inset-0
              rounded-[46%_46%_40%_40%/50%_50%_60%_60%]
              border-2 border-[#26FF59]
              shadow-[0_0_30px_rgba(38,255,89,0.55),0_0_70px_rgba(38,255,89,0.25)]
            "
          />
          {/* vinheta escura fora do rosto */}
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

    // sessão inválida / expirada
    if (
      tokenStatus === "expired" ||
      (tokenStatus !== "pending_face" &&
        tokenStatus !== "unknown" &&
        tokenStatus !== "face_captured")
    ) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[0.75rem] text-white/90 py-2 px-3 text-center leading-snug">
          QR inválido/expirado. Gere outro no app.
        </div>
      );
    }

    // já capturou
    if (tokenStatus === "face_captured") {
      return null;
    }

    // câmera pronta
    if (cameraReady) return null;

    // antes de pedir permissão
    if (!permissionAsked) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[0.75rem] text-white/90 py-2 px-3 leading-snug">
          Toque em "Ativar câmera" para começar.
        </div>
      );
    }

    // pedindo permissão agora
    if (askingPermission) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[0.75rem] text-white/90 py-2 px-3 leading-snug">
          Abrindo câmera...
        </div>
      );
    }

    // autoplay falhou
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[0.75rem] text-white/90 py-2 px-3 leading-snug">
        {cameraTryingPlay
          ? "Tentando iniciar vídeo..."
          : "Se a tela estiver preta, toque no vídeo para liberar."}
      </div>
    );
  }

  function renderCameraBlock() {
    // se já enviou selfie, travado
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

    // preview da câmera
    return (
      <div className="relative w-[320px] max-w-full h-[400px] flex items-center justify-center rounded-2xl overflow-hidden ring-1 ring-white/10 bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover [transform:scaleX(-1)]"
          playsInline
          autoPlay
          muted
          onClick={handleManualPlay}
        />
        <FaceMaskOverlay />
        {renderCameraStatusOverlay()}
      </div>
    );
  }

  function renderActionArea() {
    // finalizado
    if (selfiePreview || tokenStatus === "face_captured") {
      return (
        <div className="text-center text-[0.8rem] text-white/70 leading-relaxed px-4">
          Pronto! Já recebemos sua selfie. Você pode fechar esta tela.
        </div>
      );
    }

    // expirado / inválido
    if (tokenStatus === "expired") {
      return (
        <div className="text-center text-[0.8rem] text-red-400 leading-relaxed px-4">
          Esse QR expirou. Gere um QR novo no app.
        </div>
      );
    }

    // ainda não pedimos permissão
    if (!permissionAsked) {
      return (
        <button
          onClick={requestCameraAccess}
          disabled={
            askingPermission ||
            !sessionTicket ||
            tokenStatus !== "pending_face"
          }
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

    // já temos stream, botão Capturar
    return (
      <button
        onClick={handleCaptureAndSend}
        disabled={
          !cameraReady ||
          capturing ||
          !sessionTicket ||
          tokenStatus !== "pending_face"
        }
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
            Aponte o rosto para a área destacada. Quando estiver pronto, toque
            em{" "}
            <strong className="text-white font-medium">Capturar</strong>.
          </p>
        </header>

        {renderCameraBlock()}

        <canvas ref={canvasRef} className="hidden" />

        {errorMsg && (
          <div className="text-red-400 text-[0.75rem] leading-relaxed px-4">
            {errorMsg}
          </div>
        )}

        {renderActionArea()}

        <footer className="text-[0.7rem] text-white/40 text-center leading-relaxed max-w-[240px]">
          Iluminação clara. Rosto totalmente visível. Sem óculos escuros, boné
          ou máscara cobrindo o rosto.
        </footer>
      </div>
    </main>
  );
}

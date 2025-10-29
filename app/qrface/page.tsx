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
  // refs DOM
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ticket curto que veio no ?session=...
  const [sessionTicket, setSessionTicket] = useState<string | null>(null);

  // status atual
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("unknown");

  // preview da selfie (se já capturada)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  // câmera
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraTryingPlay, setCameraTryingPlay] = useState(false);

  // flags de permissão
  const [askingPermission, setAskingPermission] = useState(false);
  const [permissionAsked, setPermissionAsked] = useState(false);

  // envio
  const [capturing, setCapturing] = useState(false);
  const [done, setDone] = useState(false);

  // UX / erros
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // contador de expiração (segundos até expirar)
  const [expiresInSec, setExpiresInSec] = useState<number | null>(null);

  // ==========================================================
  // 1. bootstrap inicial a partir da URL
  // ==========================================================
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const rawSession = sp.get("session");

    if (!rawSession) {
      setErrorMsg("Link inválido.");
      setTokenStatus("expired");
      setDone(true);
      return;
    }

    setSessionTicket(rawSession);

    (async () => {
      try {
        const res = await fetch(
          `/api/qrface?session=${encodeURIComponent(rawSession)}`,
          {
            method: "GET",
            cache: "no-store",
          }
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

        const mappedStatus: TokenStatus =
          data.status === "pending_face"
            ? "pending_face"
            : data.status === "face_captured"
            ? "face_captured"
            : data.status === "expired"
            ? "expired"
            : data.status === "blocked"
            ? "blocked"
            : data.status === "validated"
            ? "validated"
            : "unknown";

        setTokenStatus(mappedStatus);

        if (typeof data.expires_in_sec === "number") {
          setExpiresInSec(data.expires_in_sec);
        }

        if (mappedStatus === "face_captured" && data.selfie_b64) {
          // caso a pessoa reabra o link depois
          setSelfiePreview(data.selfie_b64);
          setDone(true);
        }

        if (mappedStatus === "expired") {
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
  }, []);

  // ==========================================================
  // 1.1. countdown local → reduz expiresInSec 1/s
  //      quando chega em 0 e ainda não concluiu, trava
  // ==========================================================
  useEffect(() => {
    if (expiresInSec === null) return;
    if (done) return;
    if (
      tokenStatus === "expired" ||
      tokenStatus === "blocked" ||
      tokenStatus === "validated" ||
      tokenStatus === "face_captured"
    ) {
      return;
    }

    const id = setInterval(() => {
      setExpiresInSec((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [expiresInSec, done, tokenStatus]);

  // se zerou o contador e ainda tava pendente -> expira visualmente
  useEffect(() => {
    if (
      expiresInSec === 0 &&
      tokenStatus === "pending_face" &&
      !done
    ) {
      setTokenStatus("expired");
      setDone(true);
      setErrorMsg("Esse QR expirou. Gere outro QR no app.");
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    }
  }, [expiresInSec, tokenStatus, done, stream]);

  // ==========================================================
  // 2. pluga o MediaStream no <video> e tenta autoplay
  // ==========================================================
  const attachStreamToVideo = useCallback(async (media: MediaStream) => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    videoEl.srcObject = media;

    const tryPlay = () => {
      setCameraTryingPlay(true);
      videoEl
        .play()
        .then(() => {
          setCameraReady(true);
          setCameraTryingPlay(false);
          setErrorMsg((msg) =>
            msg ===
            "Toque no vídeo para liberar a câmera se ela estiver preta."
              ? null
              : msg
          );
        })
        .catch((err) => {
          console.warn("Falha ao dar play automático:", err);
          // Safari iOS normalmente precisa interação
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

  // ==========================================================
  // 3. pedir acesso da câmera
  // ==========================================================
  const requestCameraAccess = useCallback(async () => {
    if (askingPermission || capturing) return;
    if (done) return;

    if (!sessionTicket) {
      setErrorMsg("Sessão não encontrada. Abra o QR de novo pelo app.");
      return;
    }

    const sessionIsClearlyInvalid =
      tokenStatus === "expired" ||
      tokenStatus === "blocked" ||
      tokenStatus === "validated" ||
      tokenStatus === "face_captured" ||
      done;

    if (sessionIsClearlyInvalid) {
      setErrorMsg("Esse QR não está mais ativo. Gere outro QR no app.");
      return;
    }

    setErrorMsg(null);
    setAskingPermission(true);
    setPermissionAsked(true);

    async function getMediaFrontFirstThenFallback() {
      try {
        // tenta frontal primeiro
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
        // fallback pra qualquer câmera
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

  // ==========================================================
  // 4. cleanup câmera ao desmontar
  // ==========================================================
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stream]);

  // ==========================================================
  // 5. tentar play manual clicando no vídeo (iOS Safari etc)
  // ==========================================================
  function handleManualPlay() {
    if (!videoRef.current) return;
    if (cameraReady) return;

    setCameraTryingPlay(true);
    videoRef.current
      .play()
      .then(() => {
        setCameraReady(true);
        setCameraTryingPlay(false);
        setErrorMsg((msg) =>
          msg ===
          "Toque no vídeo para liberar a câmera se ela estiver preta."
            ? null
            : msg
        );
      })
      .catch((err) => {
        console.warn("Ainda não conseguiu dar play() manual:", err);
        setCameraTryingPlay(false);
      });
  }

  // ==========================================================
  // 6. capturar frame atual e enviar pro backend (PUT /api/qrface)
  // ==========================================================
  async function handleCaptureAndSend() {
    if (done) return;

    if (
      tokenStatus === "expired" ||
      tokenStatus === "blocked" ||
      tokenStatus === "validated" ||
      tokenStatus === "face_captured"
    ) {
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

    // flip horizontal tipo selfie
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, -w, 0, w, h);
    ctx.restore();

    const dataUrl = canvasEl.toDataURL("image/jpeg", 0.9);

    try {
      const resp = await fetch("/api/qrface", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
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

      // sucesso → salva preview / trava sessão
      setSelfiePreview(data.selfiePreview || dataUrl);
      setTokenStatus("face_captured");
      setDone(true);

      if (typeof data.expires_in_sec === "number") {
        setExpiresInSec(data.expires_in_sec);
      }

      // corta câmera
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

  // ==========================================================
  // 7. helpers de UI
  // ==========================================================
  const sessionIsClearlyInvalid =
    tokenStatus === "expired" ||
    tokenStatus === "blocked" ||
    tokenStatus === "validated" ||
    tokenStatus === "face_captured" ||
    done;

  const canAskCameraNow =
    !!sessionTicket &&
    !sessionIsClearlyInvalid &&
    !askingPermission &&
    !capturing;

  // step visual atual
  const step =
    tokenStatus === "face_captured" || done
      ? 3
      : permissionAsked
      ? 2
      : 1;

  function StepIndicator() {
    function Bubble(
      label: string,
      num: number,
      active: boolean,
      doneStep: boolean
    ) {
      return (
        <div className="flex items-center gap-2">
          <div
            className={[
              "flex h-6 w-6 items-center justify-center rounded-full text-[0.7rem] font-semibold",
              doneStep
                ? "bg-[#26FF59] text-black shadow-[0_0_10px_rgba(38,255,89,0.6)]"
                : active
                ? "bg-white text-black"
                : "bg-white/10 text-white/50 border border-white/20",
            ].join(" ")}
          >
            {num}
          </div>
          <div
            className={[
              "text-[0.7rem] leading-none tracking-tight",
              doneStep
                ? "text-[#26FF59]"
                : active
                ? "text-white"
                : "text-white/40",
            ].join(" ")}
          >
            {label}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center justify-center gap-4 text-white/80">
        {Bubble("Preparar", 1, step === 1, step > 1)}
        <div className="hidden h-[1px] w-6 bg-white/20 sm:block" />
        {Bubble("Capturar", 2, step === 2, step > 2)}
        <div className="hidden h-[1px] w-6 bg-white/20 sm:block" />
        {Bubble("Concluído", 3, step === 3, step > 3)}
      </div>
    );
  }

  // badge pequeno "Expira em mm:ss" no topo
  function CountdownBadge() {
    if (
      expiresInSec === null ||
      done ||
      tokenStatus === "face_captured" ||
      tokenStatus === "expired"
    ) {
      return null;
    }

    const mm = Math.floor(expiresInSec / 60);
    const ss = expiresInSec % 60;
    const ssPadded = ss < 10 ? `0${ss}` : String(ss);

    return (
      <div className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-[0.7rem] font-medium leading-none text-white/70">
        Expira em {mm}:{ssPadded}
      </div>
    );
  }

  function FaceMaskOverlay() {
    if (selfiePreview) return null;
    if (sessionIsClearlyInvalid) return null;
    return (
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="relative h-[300px] w-[220px]">
          {/* Moldura verde com glow */}
          <div
            className="
              absolute inset-0
              rounded-[46%_46%_40%_40%/50%_50%_60%_60%]
              border-2 border-[#26FF59]
              shadow-[0_0_30px_rgba(38,255,89,0.55),0_0_70px_rgba(38,255,89,0.25)]
            "
          />
          {/* vinheta escurecendo fora do rosto */}
          <div
            className="
              pointer-events-none absolute -inset-[100px]
              rounded-[46%_46%_40%_40%/50%_50%_60%_60%]
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

    if (sessionIsClearlyInvalid && !selfiePreview) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-2 px-3 text-center text-[0.75rem] leading-snug text-white/90">
          QR inválido ou expirado. Gere outro no app.
        </div>
      );
    }

    if (cameraReady) return null;

    if (!permissionAsked) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-2 px-3 text-[0.75rem] leading-snug text-white/90">
          Toque em "Ativar câmera" para começar.
        </div>
      );
    }

    if (askingPermission) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-2 px-3 text-[0.75rem] leading-snug text-white/90">
          Abrindo câmera...
        </div>
      );
    }

    return (
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-2 px-3 text-[0.75rem] leading-snug text-white/90">
        {cameraTryingPlay
          ? "Tentando iniciar vídeo..."
          : "Se a tela estiver preta, toque no vídeo para liberar."}
      </div>
    );
  }

  function renderCameraBlock() {
    if (selfiePreview) {
      return (
        <div className="relative flex h-[400px] w-[320px] max-w-full items-center justify-center overflow-hidden rounded-2xl bg-neutral-900 ring-2 ring-[#26FF59]/60 shadow-[0_0_40px_#26FF5966]">
          <img
            src={selfiePreview}
            alt="Selfie enviada"
            className="h-full w-full object-cover"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-2 text-center text-[0.7rem] font-medium text-white">
            Selfie enviada com sucesso
          </div>
        </div>
      );
    }

    return (
      <div className="relative flex h-[400px] w-[320px] max-w-full items-center justify-center overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)]"
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
    if (selfiePreview || tokenStatus === "face_captured" || done) {
      return (
        <div className="px-4 text-center text-[0.8rem] leading-relaxed text-white/70">
          Pronto! Já recebemos sua selfie. Você pode fechar esta tela.
        </div>
      );
    }

    if (sessionIsClearlyInvalid) {
      return (
        <div className="px-4 text-center text-[0.8rem] leading-relaxed text-red-400">
          Esse QR expirou ou não é mais válido. Gere um QR novo no app.
        </div>
      );
    }

    if (!permissionAsked) {
      return (
        <button
          onClick={requestCameraAccess}
          disabled={!canAskCameraNow}
          className={[
            "w-full rounded-md py-3 text-[0.9rem] font-semibold tracking-[-0.02em]",
            "bg-[#26FF59] text-black shadow-[0_0_20px_rgba(38,255,89,0.6)]",
            "active:scale-[0.99] transition-all",
            "disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none",
          ].join(" ")}
        >
          {askingPermission ? "Solicitando acesso..." : "Ativar câmera"}
        </button>
      );
    }

    return (
      <button
        onClick={handleCaptureAndSend}
        disabled={
          !cameraReady ||
          capturing ||
          !sessionTicket ||
          sessionIsClearlyInvalid
        }
        className={[
          "w-full rounded-md py-3 text-[0.9rem] font-semibold tracking-[-0.02em]",
          "bg-[#26FF59] text-black shadow-[0_0_20px_rgba(38,255,89,0.6)]",
          "active:scale-[0.99] transition-all",
          "disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none",
        ].join(" ")}
      >
        {capturing ? "Enviando..." : "Capturar e enviar"}
      </button>
    );
  }

  function renderExpiryInfo() {
    if (
      expiresInSec === null ||
      done ||
      tokenStatus === "face_captured" ||
      tokenStatus === "expired"
    ) {
      return null;
    }

    const mm = Math.floor(expiresInSec / 60);
    const ss = expiresInSec % 60;
    const ssPadded = ss < 10 ? `0${ss}` : String(ss);

    return (
      <div className="text-[0.7rem] leading-none text-white/50">
        Esse passo expira em {mm}:{ssPadded}
      </div>
    );
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,#1a1a1a_0%,#000000_70%)] p-6 text-white">
      <div className="flex w-full max-w-[22rem] flex-col items-center gap-6 text-center">
        {/* Steps + timer */}
        <div className="flex flex-col items-center gap-2">
          <StepIndicator />
          <CountdownBadge />
        </div>

        {/* Header */}
        <header className="flex flex-col gap-2">
          <h1 className="text-[1.1rem] font-semibold tracking-tight text-white">
            Verificação facial
          </h1>
          <p className="text-[0.8rem] leading-relaxed text-white/70">
            Centralize seu rosto dentro da moldura verde.
            Quando estiver pronto, toque em{" "}
            <strong className="font-medium text-white">Capturar</strong>.
          </p>
        </header>

        {/* câmera / preview da selfie */}
        {renderCameraBlock()}

        {/* canvas offscreen pra capturar frame jpeg */}
        <canvas ref={canvasRef} className="hidden" />

        {/* erros */}
        {errorMsg && (
          <div className="px-4 text-[0.75rem] leading-relaxed text-red-400">
            {errorMsg}
          </div>
        )}

        {/* botão principal */}
        {renderActionArea()}

        {/* contador textual abaixo do botão */}
        {renderExpiryInfo()}

        {/* rodapé explicando a captura */}
        <footer className="max-w-[240px] space-y-2 text-center text-[0.7rem] leading-relaxed text-white/40">
          <div>
            Iluminação clara. Rosto totalmente visível.
            Nada cobrindo olhos, boca ou testa.
          </div>
          <div className="text-[0.65rem] leading-snug text-white/30">
            A imagem é usada apenas para confirmar sua identidade e proteger
            sua conta. Ela é transmitida de forma segura.
          </div>
        </footer>
      </div>
    </main>
  );
}

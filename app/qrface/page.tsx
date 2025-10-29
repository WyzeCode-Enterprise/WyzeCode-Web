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

  // ==========================================================
  // 1. bootstrap inicial da sessão a partir da URL (uma vez)
  // ==========================================================
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const rawSession = sp.get("session");

    if (!rawSession) {
      setErrorMsg("Link inválido.");
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
              "Sessão inválida. Abra novamente o QR pelo app."
          );
          setDone(true);
          return;
        }

        // regra:
        // - se backend já tem selfie => status face_captured
        // - se backend disser blocked/validated, respeita
        // - senão => pending_face
        let mappedStatus: TokenStatus;
        if (data.status === "face_captured") {
          mappedStatus = "face_captured";
        } else if (data.status === "blocked") {
          mappedStatus = "blocked";
        } else if (data.status === "validated") {
          mappedStatus = "validated";
        } else {
          mappedStatus = "pending_face";
        }

        setTokenStatus(mappedStatus);

        if (mappedStatus === "face_captured" && data.selfie_b64) {
          // já capturado anteriormente
          setSelfiePreview(data.selfie_b64);
          setDone(true);
        }
      } catch (netErr) {
        console.error("Erro ao validar sessão inicial:", netErr);
        setErrorMsg("Erro de rede. Abra novamente o QR pelo app.");
        setDone(true);
      }
    })();
  }, []);

  // ==========================================================
  // 2. plugar stream no <video> e tentar autoplay
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
          // Safari iOS pode exigir interação manual
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
  // 3. pedir câmera
  // ==========================================================
  const requestCameraAccess = useCallback(async () => {
    if (askingPermission || capturing) return;
    if (done) return;

    if (!sessionTicket) {
      setErrorMsg("Sessão não encontrada. Abra o QR de novo pelo app.");
      return;
    }

    // sessão só fica bloqueada se já finalizou MESMO
    const sessionIsClearlyFinished =
      tokenStatus === "face_captured" ||
      tokenStatus === "blocked" ||
      tokenStatus === "validated" ||
      done;

    if (sessionIsClearlyFinished) {
      setErrorMsg(
        "Essa sessão já foi finalizada. Se precisa reenviar, gere outro QR no app."
      );
      return;
    }

    setErrorMsg(null);
    setAskingPermission(true);
    setPermissionAsked(true);

    async function getMediaFrontFirstThenFallback() {
      try {
        // tenta câmera frontal primeiro
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
        // fallback pra qualquer câmera disponível
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

    // só bloqueia se já foi finalizado / bloqueado / validado
    if (
      tokenStatus === "face_captured" ||
      tokenStatus === "blocked" ||
      tokenStatus === "validated"
    ) {
      setErrorMsg(
        "Essa sessão já foi finalizada. Se precisa reenviar, gere outro QR no app."
      );
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

    // flip horizontal tipo selfie/espelho
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

      // corta câmera por privacidade
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
  const sessionIsClearlyFinished =
    tokenStatus === "face_captured" ||
    tokenStatus === "blocked" ||
    tokenStatus === "validated" ||
    done;

  const canAskCameraNow =
    !!sessionTicket &&
    !sessionIsClearlyFinished &&
    !askingPermission &&
    !capturing;

  const step =
    tokenStatus === "face_captured" || done
      ? 3
      : permissionAsked
      ? 2
      : 1;

  // subcomponente: etapa visual do fluxo (1 Preparar -> 2 Capturar -> 3 Concluído)
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

  // subcomponente: máscara verde/overlay do rosto na câmera
  function FaceMaskOverlay() {
    if (selfiePreview) return null;
    if (sessionIsClearlyFinished) return null;
    return (
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="relative h-[300px] w-[220px]">
          <div
            className="
              absolute inset-0
              rounded-[46%_46%_40%_40%/50%_50%_60%_60%]
              border-2 border-[#26FF59]
              shadow-[0_0_30px_rgba(38,255,89,0.55),0_0_70px_rgba(38,255,89,0.25)]
            "
          />
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

  // overlay no rodapé do vídeo (mensagens tipo "Abrindo câmera...")
  function renderCameraStatusOverlay() {
    if (selfiePreview) return null;

    if (sessionIsClearlyFinished && !selfiePreview) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-2 px-3 text-center text-[0.75rem] leading-snug text-white/90">
          Sessão finalizada. Gere um novo QR no app se precisar reenviar.
        </div>
      );
    }

    if (cameraReady) return null;

    if (!permissionAsked) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-2 px-3 text-center text-[0.75rem] leading-snug text-white/90">
          Toque em "Ativar câmera" para começar.
        </div>
      );
    }

    if (askingPermission) {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-2 px-3 text-center text-[0.75rem] leading-snug text-white/90">
          Abrindo câmera...
        </div>
      );
    }

    return (
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-2 px-3 text-center text-[0.75rem] leading-snug text-white/90">
        {cameraTryingPlay
          ? "Tentando iniciar vídeo..."
          : "Se a tela estiver preta, toque no vídeo para liberar."}
      </div>
    );
  }

  // bloco principal de preview (ou câmera ao vivo)
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

  // área abaixo do preview: botão de ação ou mensagem final
  function renderActionArea() {
    if (selfiePreview || tokenStatus === "face_captured" || done) {
      return (
        <div className="px-4 text-center text-[0.8rem] leading-relaxed text-white/70">
          Pronto! Já recebemos sua selfie. Você pode fechar esta tela.
        </div>
      );
    }

    if (sessionIsClearlyFinished) {
      return (
        <div className="px-4 text-center text-[0.8rem] leading-relaxed text-red-400">
          Essa sessão já foi finalizada. Gere um novo QR no app se quiser tentar
          outra foto.
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
          sessionIsClearlyFinished
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

  // ==========================================================
  // render final da página
  // ==========================================================
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,#1a1a1a_0%,#000000_70%)] p-6 text-white">
      <div className="flex w-full max-w-[22rem] flex-col items-center gap-6 text-center">
        {/* Steps */}
        <div className="flex flex-col items-center gap-2">
          <StepIndicator />
        </div>

        {/* Header */}
        <header className="flex flex-col gap-2">
          <h1 className="text-[1.1rem] font-semibold tracking-tight text-white">
            Verificação facial
          </h1>
          <p className="text-[0.8rem] leading-relaxed text-white/70">
            Centralize seu rosto dentro da moldura verde. Quando estiver pronto,
            toque em{" "}
            <strong className="font-medium text-white">Capturar</strong>.
          </p>
        </header>

        {/* câmera / preview da selfie */}
        {renderCameraBlock()}

        {/* canvas offscreen pra captura do frame jpeg */}
        <canvas ref={canvasRef} className="hidden" />

        {/* erros */}
        {errorMsg && (
          <div className="px-4 text-[0.75rem] leading-relaxed text-red-400">
            {errorMsg}
          </div>
        )}

        {/* botão principal */}
        {renderActionArea()}

        {/* rodapé explicando a captura */}
        <footer className="max-w-[240px] space-y-2 text-center text-[0.7rem] leading-relaxed text-white/40">
          <div>
            Iluminação clara. Rosto totalmente visível. Nada cobrindo olhos,
            boca ou testa.
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

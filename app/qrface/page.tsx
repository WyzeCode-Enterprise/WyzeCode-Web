"use client";

import React, { useEffect, useRef, useState } from "react";

export default function QRFacePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // pega token da URL (?wzb_token=...)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("wzb_token");
    setToken(t);
  }, []);

  // abre câmera frontal
  useEffect(() => {
    async function openCamera() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = media;
          await videoRef.current.play();
          setStreamReady(true);
        }
      } catch (err) {
        console.error("Erro ao acessar câmera:", err);
        setErrorMsg("Não foi possível acessar a câmera.");
      }
    }
    openCamera();

    // cleanup parar camera ao sair
    return () => {
      const tracks = (videoRef.current?.srcObject as MediaStream)?.getTracks?.();
      tracks?.forEach((t) => t.stop());
    };
  }, []);

  // captura foto atual do vídeo e envia
  async function handleCaptureAndSend() {
    if (!videoRef.current || !canvasRef.current || !token || done) return;

    setCapturing(true);
    setErrorMsg(null);

    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;

    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;

    canvasEl.width = w;
    canvasEl.height = h;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
      setCapturing(false);
      setErrorMsg("Erro interno de captura.");
      return;
    }

    ctx.drawImage(videoEl, 0, 0, w, h);

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

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <header className="text-center flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-white">Verificação de rosto</h1>
          <p className="text-sm text-white/60 leading-relaxed">
            Posicione seu rosto dentro do contorno e toque em{" "}
            <strong className="text-white font-medium">Capturar</strong>.
          </p>
        </header>

        {selfiePreview ? (
          <div className="relative w-[260px] h-[260px] rounded-xl overflow-hidden ring-1 ring-white/20 bg-neutral-900 flex items-center justify-center">
            <img
              src={selfiePreview}
              alt="Sua selfie enviada"
              className="object-cover w-full h-full"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-center text-xs py-2 text-white">
              Selfie enviada com sucesso
            </div>
          </div>
        ) : (
          <>
            {/* vídeo + overlay oval */}
            <div className="relative w-[260px] h-[260px] flex items-center justify-center">
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover rounded-xl"
                playsInline
                muted
              />

              {/* Oval verde */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="w-[200px] h-[260px] rounded-full border-2 border-[#26FF59]"
                  style={{
                    boxShadow:
                      "0 0 25px rgba(38,255,89,0.4), 0 0 60px rgba(38,255,89,0.15)",
                  }}
                />
              </div>

              {/* escurecer volta */}
              <div
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 70%)",
                }}
              />
            </div>

            {/* canvas oculto pra captura */}
            <canvas ref={canvasRef} className="hidden" />
          </>
        )}

        {errorMsg && (
          <div className="text-red-400 text-xs text-center leading-relaxed">
            {errorMsg}
          </div>
        )}

        {!selfiePreview && (
          <button
            onClick={handleCaptureAndSend}
            disabled={!streamReady || capturing || !token}
            className={[
              "w-full rounded-md py-3 text-sm font-semibold",
              "bg-[#26FF59] text-black",
              "disabled:opacity-30 disabled:cursor-not-allowed",
              "active:scale-[0.99] transition-all",
            ].join(" ")}
          >
            {capturing ? "Enviando..." : "Capturar e enviar"}
          </button>
        )}

        {selfiePreview && (
          <div className="text-center text-xs text-white/60 leading-relaxed">
            Você já enviou sua selfie. Pode fechar esta tela.
          </div>
        )}

        <footer className="text-[10px] text-white/30 text-center leading-relaxed max-w-[240px]">
          Iluminação clara e rosto descoberto. Evite óculos escuros, máscara ou boné cobrindo o rosto.
        </footer>
      </div>
    </main>
  );
}

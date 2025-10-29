"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Loader2, Eye, EyeOff, ArrowLeft, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field"
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp"
import { validateEmail, validatePassword } from "@/app/api/emailValidation"
import { CheckCircle2 } from "lucide-react"

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const [step, setStep] = useState<"login" | "email" | "password" | "register">("email")
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [emailError, setEmailError] = useState<{ message: string } | null>(null)
  const [passwordError, setPasswordError] = useState<{ message: string } | null>(null)
  const [showEmailError, setShowEmailError] = useState(true)
  const [showPasswordInput, setShowPasswordInput] = useState(false)

  const [stepOtp, setStepOtp] = useState(false)
  const [otp, setOtp] = useState("")
  const [otpError, setOtpError] = useState<string | null>(null)
  const [otpSubmitting, setOtpSubmitting] = useState(false)
  const [resending, setResending] = useState(false)

  const [otpSuccess, setOtpSuccess] = useState(false)

  const [nome, setNome] = useState("")
  const [telefone, setTelefone] = useState("")
  const [cpfCnpj, setCpfCnpj] = useState("")
  const [registerError, setRegisterError] = useState<string | null>(null)

  // fluxo de recuperação de senha
  const [forgotStep, setForgotStep] = useState<"idle" | "request" | "otp" | "reset">("idle")
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotLoading, setForgotLoading] = useState(false)

  // otp da recuperação
  const [forgotOtp, setForgotOtp] = useState("")
  const [forgotOtpError, setForgotOtpError] = useState<string | null>(null)
  const [forgotOtpSubmitting, setForgotOtpSubmitting] = useState(false)
  const [forgotResending, setForgotResending] = useState(false)

  const [showNewPass, setShowNewPass] = useState(false)
  const [showNewPassConfirm, setShowNewPassConfirm] = useState(false)

  // nova senha (reset)
  const [newPass, setNewPass] = useState("")
  const [newPassConfirm, setNewPassConfirm] = useState("")
  const [newPassError, setNewPassError] = useState<string | null>(null)

  // controle de sucesso visual (reuso da mesma tela verde)
  const [successMode, setSuccessMode] = useState<"register" | "reset" | null>(null)

  useEffect(() => {
    const savedStep = sessionStorage.getItem("savedStep")
    if (savedStep === "register") {
      const savedEmail = sessionStorage.getItem("savedEmail")
      const savedNome = sessionStorage.getItem("savedNome")
      const savedTelefone = sessionStorage.getItem("savedTelefone")
      const savedCpfCnpj = sessionStorage.getItem("savedCpfCnpj")

      if (savedEmail) setEmail(savedEmail)
      setStep("register")
      if (savedNome) setNome(savedNome)
      if (savedTelefone) setTelefone(savedTelefone)
      if (savedCpfCnpj) setCpfCnpj(savedCpfCnpj)
    }
  }, [])


  useEffect(() => {
    if (step === "register") {
      sessionStorage.setItem("savedStep", "register")
      sessionStorage.setItem("savedEmail", email)
      sessionStorage.setItem("savedNome", nome)
      sessionStorage.setItem("savedTelefone", telefone)
      sessionStorage.setItem("savedCpfCnpj", cpfCnpj)
    } else {
      sessionStorage.removeItem("savedStep")
      sessionStorage.removeItem("savedEmail")
      sessionStorage.removeItem("savedNome")
      sessionStorage.removeItem("savedTelefone")
      sessionStorage.removeItem("savedCpfCnpj")
    }
  }, [step, email, nome, telefone, cpfCnpj])



  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();

    //
    // 1. FLUXO "ESQUECI MINHA SENHA"
    //
    if (forgotStep !== "idle") {
      // STEP 1: pedir email
      if (forgotStep === "request") {
        const { valid, message } = validateEmail(forgotEmail);
        if (!valid) {
          setForgotError(message || "Email inválido");
          return;
        }
        setForgotError(null);
        setForgotLoading(true);

        try {
          const resp = await fetch("/api/forgot-pass", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: forgotEmail }),
          });

          const data = await resp.json();
          setForgotLoading(false);

          if (!resp.ok) {
            setForgotError(data.error || "Erro ao enviar código.");
            return;
          }

          // foi enviado o OTP pro email
          setForgotStep("otp");
        } catch {
          setForgotLoading(false);
          setForgotError("Erro ao conectar com o servidor.");
        }
        return;
      }
      // STEP 2: validar OTP
      if (forgotStep === "otp") {
        if (forgotOtp.length < 6) {
          setForgotOtpError("Digite o código completo.");
          return;
        }

        setForgotOtpError(null);
        setForgotOtpSubmitting(true);

        // segura 2s pra dar tempo de mostrar o loader
        setTimeout(async () => {
          try {
            const resp = await fetch("/api/forgot-pass", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: forgotEmail, otp: forgotOtp }),
            });

            const data = await resp.json();
            setForgotOtpSubmitting(false);

            if (!resp.ok) {
              setForgotOtpError(data.error || "Código inválido");
              return;
            }

            // OTP validado → agora pede nova senha
            setForgotStep("reset");
          } catch {
            setForgotOtpSubmitting(false);
            setForgotOtpError("Erro ao conectar com o servidor.");
          }
        }, 2000);

        return;
      }

      // STEP 3: enviar nova senha
      if (forgotStep === "reset") {
        if (!newPass || !newPassConfirm) {
          setNewPassError("Preencha os dois campos de senha.");
          return;
        }
        if (newPass !== newPassConfirm) {
          setNewPassError("As senhas não conferem.");
          return;
        }
        const { valid } = validatePassword(newPass);
        if (!valid) {
          setNewPassError("Senha fraca. Use maiúscula, minúscula, número e símbolo (mín. 8).");
          return;
        }

        setNewPassError(null);
        setSubmitting(true);

        try {
          const resp = await fetch("/api/forgot-pass", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: forgotEmail,
              otp: forgotOtp,
              password: newPass,
            }),
          });

          const data = await resp.json();
          setSubmitting(false);

          if (!resp.ok) {
            setNewPassError(data.error || "Erro ao redefinir senha.");
            return;
          }

          // sucesso total -> mostrar overlay verde
          setSuccessMode("reset");
          setOtpSuccess(true);

          // depois do "sucesso", volta pro login com email já preenchido
          setTimeout(() => {
            setOtpSuccess(false);
            setForgotStep("idle");
            setStep("password");
            setEmail(forgotEmail); // já deixa o email que resetou
            setShowPasswordInput(true);
            setPassword(""); // usuário vai digitar a senha nova agora
          }, 3500);

        } catch {
          setSubmitting(false);
          setNewPassError("Erro ao conectar com o servidor.");
        }

        return;
      }
    }

    //
    // 2. FLUXO NORMAL (LOGIN / REGISTER)
    //
    if (step === "email") {
      const { valid, message } = validateEmail(email);
      if (!valid) {
        setEmailError({ message: message || "Email inválido" });
        setShowEmailError(true);
        return;
      }
      setEmailError(null);
      setShowEmailError(false);
      setLoading(true);

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await response.json();
        setLoading(false);

        if (data?.newUser) {
          setStep("register");
          return;
        }

        setStep("password");
        setShowPasswordInput(true);
      } catch {
        setLoading(false);
        setEmailError({ message: "Erro ao conectar com o servidor" });
      }
    }

    else if (step === "password") {
      const { valid, message } = validatePassword(password);
      if (!valid) {
        setPasswordError({ message: message || "Senha inválida" });
        return;
      }
      setPasswordError(null);
      setSubmitting(true);

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        if (!response.ok) {
          setPasswordError({ message: data.error || "Erro ao logar" });
          setSubmitting(false);
        } else {
          window.location.href = data.redirect;
        }
      } catch {
        setPasswordError({ message: "Erro ao conectar com o servidor" });
        setSubmitting(false);
      }
    }

    else if (step === "register") {
      if (!stepOtp) {
        if (!nome || !telefone || !cpfCnpj || !password) {
          setRegisterError("Preencha todos os campos.");
          return;
        }
        setRegisterError(null);
        setSubmitting(true);

        try {
          const response = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, nome, telefone, cpfCnpj, password }),
          });
          const data = await response.json();
          setSubmitting(false);

          if (!response.ok) {
            setRegisterError(data.error || "Erro ao registrar");
          } else {
            setStepOtp(true);
          }
        } catch {
          setRegisterError("Erro ao conectar com o servidor");
          setSubmitting(false);
        }
      }
      else if (stepOtp && otp.length === 6) {
        setOtpSubmitting(true);
        setOtpError(null);

        setTimeout(async () => {
          try {
            const response = await fetch("/api/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, nome, telefone, cpfCnpj, password, otp }),
            });

            const data = await response.json();

            if (!response.ok) {
              setOtpError(data.error || "Erro ao validar código");
              setOtpSubmitting(false);
              return;
            }

            setOtpSubmitting(false);
            setOtpError(null);
            setOtp("");
            setStepOtp(false);

            setSuccessMode("register");
            setOtpSuccess(true);

            setTimeout(() => {
              setOtpSuccess(false);
              setStep("email");
              setEmail(data.email || email);
              setShowPasswordInput(true);
              setStep("password");
              setPassword("");
            }, 3500);
          } catch {
            setOtpError("Erro ao conectar com o servidor");
            setOtpSubmitting(false);
          }
        }, 3000);
      }
    }
  };


  const handleBackToEmail = () => {
    // volta pro login normal
    setForgotStep("idle")

    setStep("email");
    setShowPasswordInput(false);

    // reset fluxo normal
    setStepOtp(false);
    setOtp("");
    setNome("");
    setTelefone("");
    setCpfCnpj("");
    setPassword("");
    setRegisterError(null);
    setOtpError(null);
    setEmailError(null);
    setPasswordError(null);
    setSubmitting(false);
    setOtpSubmitting(false);

    // reset fluxo forgot
    setForgotEmail("");
    setForgotError(null);
    setForgotLoading(false);
    setForgotOtp("");
    setForgotOtpError(null);
    setForgotOtpSubmitting(false);
    setForgotResending(false);
    setNewPass("");
    setNewPassConfirm("");
    setNewPassError(null);
    setSuccessMode(null);
  };

  return (
    <div className={cn("flex flex-col gap-8 text-foreground bg-background", className)} {...props}>

      {otpSuccess && (
        <div className="fixed inset-0 z-60 flex flex-col items-center justify-center bg-background backdrop-blur-md text-center animate-fade-in px-6">
          <div className="flex flex-col items-center space-y-4 sm:space-y-6">
            <img
              src="./Design sem nome (9).svg"
              alt="Sucesso"
              className="w-60 h-60 sm:w-72 sm:h-72 md:w-80 md:h-80 drop-shadow-[0_0_25px_#26FF5950] transition-transform duration-500 ease-out scale-100"
            />

            <h2 className="text-3xl sm:text-4xl font-bold text-[#26FF59] tracking-tight drop-shadow-[0_0_10px_#26FF5930]">
              {successMode === "reset"
                ? "Senha atualizada com sucesso!"
                : "Código validado com sucesso!"}
            </h2>

            <p className="opacity-70 text-base sm:text-lg max-w-lg leading-relaxed text-foreground/80">
              {successMode === "reset"
                ? (
                  <>
                    Sua senha foi redefinida.<br />
                    Estamos te levando de volta ao login...
                  </>
                ) : (
                  <>
                    Seu código de validação foi confirmado com êxito.<br />
                    Você será redirecionado ao login, aguarde...
                  </>
                )}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleNext} autoComplete="on">
        <FieldGroup>
          <div className="flex flex-col items-center gap-4 text-center">
            <a href="/login" className="flex flex-col items-center gap-3 font-medium text-foreground">
              <img
                className="h-14 w-14"
                src="https://www.wyzebank.com/lg_files_wb/svg_files/icon_green_black.svg"
                alt="Logo Wyze Bank"
              />
            </a>

            <h1 className="text-[27px] font-bold text-foreground text-center">
              {forgotStep === "request"
                ? "Insira o email para alterar a senha"
                : forgotStep === "otp"
                  ? "Informe o código recebido"
                  : forgotStep === "reset"
                    ? "Digite sua nova senha"
                    : step === "register"
                      ? "Crie sua conta agora mesmo"
                      : "Boas-vindas ao Wyze Bank!"}
            </h1>

            {/* Só mostra essa ajuda quando é fluxo de login normal (sem forgot e ainda no e-mail de login) */}
            {forgotStep === "idle" && step === "email" && (
              <FieldDescription className="text-[15px] mb-5">
                Problemas no login?{" "}
                <a
                  href="https://support.wyzebank.com/docs/login-help/problems-accessing-my-account"
                  className="inline-flex items-center text-primary opacity-70 hover:opacity-100 transition-all"
                >
                  Obtenha ajuda
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                    className="ml-1 h-[0.9em] w-[0.9em]"
                  >
                    <path d="M14.3349 13.3301V6.60645L5.47065 15.4707C5.21095 15.7304 4.78895 15.7304 4.52925 15.4707C4.26955 15.211 4.26955 14.789 4.52925 14.5293L13.3935 5.66504H6.66011C6.29284 5.66504 5.99507 5.36727 5.99507 5C5.99507 4.63273 6.29284 4.33496 6.66011 4.33496H14.9999L15.1337 4.34863C15.4369 4.41057 15.665 4.67857 15.665 5V13.3301C15.6649 13.6973 15.3672 13.9951 14.9999 13.9951C14.6327 13.9951 14.335 13.6973 14.3349 13.3301Z" />
                  </svg>
                </a>
              </FieldDescription>
            )}
          </div>

    <div className="relative flex flex-col">

  {/* BOTÃO VOLTAR:
     - aparece se (fluxo normal e não está em "email")
     - ou se está no fluxo forgotStep === "request"
     - agora com z-50 e pointer-events-auto pra garantir clique
  */}
  {(
    (forgotStep === "idle" && step !== "email") ||
    (forgotStep === "request")
  ) && (
    <button
      type="button"
      onClick={handleBackToEmail}
      className={cn(
        "absolute right-4 text-muted-foreground hover:text-foreground cursor-pointer opacity-50",
        // garante que fica clicável acima do input
        "z-50 pointer-events-auto transition"
      )}
      style={{
        top: "1.75rem",
        transform: "translateY(-50%)",
      }}
    >
      <ArrowLeft size={20} />
    </button>
  )}

  {/* =============== FLUXO ESQUECI SENHA =============== */}
  {forgotStep === "request" && (
    <>
      <Input
        id="forgot-email"
        type="text"
        placeholder="Digite seu email para recuperar a senha"
        value={forgotEmail}
        onChange={(e) => setForgotEmail(e.target.value)}
        disabled={forgotLoading}
        className={cn(
          "bg-[#020202] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 pr-12 duration-300 rounded-md border",
          forgotError ? "border-red-500" : "border-[#151515]"
        )}
        style={{ fontFamily: "inherit" }}
      />

      {forgotError && (
        <div className="flex items-center gap-1 mt-1 text-sm text-red-500">
          <AlertCircle size={16} />
          <span>{forgotError}</span>
        </div>
      )}
    </>
  )}

{forgotStep === "otp" && (
  <div className="flex flex-col gap-4 mt-2 w-full">

    {/* header com input de email e botão voltar */}
    <div className="relative flex flex-col">
      {/* input email bloqueado (mostra pra qual email o código foi enviado) */}
      <Input
        id="forgot-email-readonly"
        type="text"
        value={forgotEmail}
        disabled
        className={cn(
          "bg-[#020202] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground",
          "h-13 pl-5 pr-11 rounded-md border border-[#151515] cursor-not-allowed text-left"
        )}
        style={{ fontFamily: "inherit" }}
      />

      {/* botão voltar (agora no canto direito) */}
      <button
        type="button"
        onClick={handleBackToEmail}
        className={cn(
          "absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground opacity-60",
          "cursor-pointer transition z-50 pointer-events-auto"
        )}
      >
        <ArrowLeft size={20} />
      </button>
    </div>

    {/* bloco OTP */}
    <div className="flex flex-col gap-4 items-center w-full">
      <Field>
        <FieldLabel htmlFor="forgot-otp" className="sr-only">
          Código OTP
        </FieldLabel>

        <InputOTP
          maxLength={6}
          id="forgot-otp"
          value={forgotOtp}
          onChange={(value: string) => setForgotOtp(value)}
          containerClassName="gap-4 w-full justify-center"
        >
          <InputOTPGroup className="gap-2.5 *:data-[slot=input-otp-slot]:h-16 *:data-[slot=input-otp-slot]:w-12 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border *:data-[slot=input-otp-slot]:text-xl">
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup className="gap-2.5 *:data-[slot=input-otp-slot]:h-16 *:data-[slot=input-otp-slot]:w-12 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border *:data-[slot=input-otp-slot]:text-xl">
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>

        {forgotOtpError && (
          <div className="flex items-center gap-1 mt-1 text-sm text-red-500">
            <AlertCircle size={16} />
            <span>{forgotOtpError}</span>
          </div>
        )}

        <FieldDescription className="text-center mt-1">
          Não recebeu?{" "}
          <button
            type="button"
            onClick={async () => {
              if (forgotResending) return;
              setForgotResending(true);
              try {
                const res = await fetch("/api/forgot-pass", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: forgotEmail }),
                });
                const data = await res.json();
                if (!res.ok) {
                  setForgotOtpError(
                    data.error || "Erro ao reenviar código"
                  );
                }
              } catch {
                setForgotOtpError("Erro ao reenviar código");
              } finally {
                setForgotResending(false);
              }
            }}
            className="text-muted-foreground underline cursor-pointer hover:text-foreground transition-all"
          >
            {forgotResending ? "enviando..." : "Reenviar Código"}
          </button>
        </FieldDescription>
      </Field>
    </div>
  </div>
)}
            {forgotStep === "reset" && (
              <div
                className={cn(
        "relative overflow-hidden transition-all duration-500",
        "max-h-[200px] opacity-100 translate-y-0"
      )}
              >
                <div className="relative flex flex-col gap-1 pb-8">
                  {/* Nova senha (top input) */}
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPass ? "text" : "password"}
                      placeholder="Nova senha"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className={cn(
                        "bg-[#020202] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 pr-12 rounded-t-md rounded-b-none transition-all duration-500 transform border",
                        newPassError ? "border-red-500" : "border-[#151515]"
                      )}
                      style={{ fontFamily: "inherit" }}
                    />

                    {/* olho individual da nova senha */}
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground opacity-50"
                    >
                      {showNewPass ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>

                  {/* Confirmar nova senha (bottom input) */}
                  <div className="relative -mt-1">
                    <Input
                      id="new-password-confirm"
                      type={showNewPassConfirm ? "text" : "password"}
                      placeholder="Confirmar nova senha"
                      value={newPassConfirm}
                      onChange={(e) => setNewPassConfirm(e.target.value)}
                      className={cn(
                        "bg-[#020202] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 pr-12 rounded-b-md rounded-t-none transition-all duration-500 transform border",
                        newPassError ? "border-red-500" : "border-[#151515]"
                      )}
                      style={{ fontFamily: "inherit" }}
                    />

                    {/* olho individual da confirmação */}
                    <button
                      type="button"
                      onClick={() => setShowNewPassConfirm(!showNewPassConfirm)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground opacity-50"
                    >
                      {showNewPassConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>

                  {/* Erro geral das novas senhas */}
                  {newPassError && (
                    <div
                      className={cn(
                        "absolute left-0 bottom-1 flex items-center gap-1 text-sm text-red-500 pointer-events-none transition-all duration-300",
                        "opacity-100 translate-y-0"
                      )}
                    >
                      <AlertCircle size={16} />
                      <span>{newPassError}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* =============== FLUXO NORMAL LOGIN / REGISTER =============== */}
            {forgotStep === "idle" && (
              <>
                {/* FIELD EMAIL LOGIN */}
                <div className="relative">
                  <Input
                    id="email"
                    name="username"
                    type="text"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading || step !== "email"}
                    autoComplete="off"
                    onFocus={() => setShowEmailError(false)}
                    onBlur={() => emailError && setShowEmailError(true)}
                    className={cn(
                      "bg-[#020202] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 pr-12 duration-300 rounded-t-md transition-all",
                      emailError ? "border-red-500" : "border-[#151515]",
                      loading ? "opacity-100" : "",
                      step === "password" ? "rounded-b-none" : "rounded-b-md"
                    )}
                    style={{ fontFamily: "inherit" }}
                  />
                  {loading && (
                    <Loader2
                      className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                      size={20}
                    />
                  )}
                </div>

                {emailError && (
                  <div className="flex items-center gap-1 mt-1 text-sm text-red-500">
                    <AlertCircle size={16} />
                    <span>{emailError.message}</span>
                  </div>
                )}

                {step === "register" && !stepOtp && (
                  <div className="flex flex-col transition-all duration-500 mt-4">
                    <Input
                      type="text"
                      placeholder="Nome completo"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      disabled={submitting}
                      className="bg-[#020202] border-[#151515] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 border-t-md rounded-t-md rounded-b-none transition-all duration-300"
                      style={{ fontFamily: "inherit" }}
                    />

                    <Input
                      type="text"
                      placeholder="Número de telefone"
                      value={telefone}
                      onFocus={() => {
                        if (!telefone.startsWith("+55")) {
                          setTelefone("+55 ");
                        }
                      }}
                      onChange={(e) => {
                        let val = e.target.value.replace(/\D/g, "");
                        if (val.length > 13) val = val.slice(0, 13);

                        let formatted = "";
                        if (val.length > 0) formatted = "+" + val.slice(0, 2);
                        if (val.length >= 3) formatted += " " + val.slice(2, 4);
                        if (val.length >= 5) formatted += " " + val.slice(4, 9);
                        if (val.length >= 10) formatted += "-" + val.slice(9, 13);

                        setTelefone(formatted);
                      }}
                      onBlur={() => {
                        const digits = telefone.replace(/\D/g, "");
                        if (digits.length !== 13) {
                        }
                      }}
                      onKeyDown={(e) => {
                        if (!/[0-9]/.test(e.key) && e.key !== "Backspace" && e.key !== "Delete") {
                          e.preventDefault();
                        }
                      }}
                      disabled={submitting}
                      maxLength={17}
                      className="bg-[#020202] border-[#151515] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 border-t-0 rounded-none transition-all duration-300"
                      style={{ fontFamily: "inherit" }}
                    />

                    <Input
                      type="text"
                      placeholder="Cpf ou Cnpj"
                      value={cpfCnpj}
                      onChange={(e) => {
                        let val = e.target.value.replace(/\D/g, "");

                        if (val.length <= 11) {
                          val = val.slice(0, 11);
                          let formatted = val;
                          if (val.length > 3) formatted = val.slice(0, 3) + "." + val.slice(3);
                          if (val.length > 6) formatted = formatted.slice(0, 7) + "." + formatted.slice(7);
                          if (val.length > 9) formatted = formatted.slice(0, 11) + "-" + formatted.slice(11);
                          setCpfCnpj(formatted);
                        } else {
                          val = val.slice(0, 14);
                          let formatted = val;
                          if (val.length > 2) formatted = val.slice(0, 2) + "." + val.slice(2);
                          if (val.length > 5) formatted = formatted.slice(0, 6) + "." + formatted.slice(6);
                          if (val.length > 8) formatted = formatted.slice(0, 10) + "/" + formatted.slice(10);
                          if (val.length > 12) formatted = formatted.slice(0, 15) + "-" + formatted.slice(15);
                          setCpfCnpj(formatted);
                        }
                      }}
                      disabled={submitting}
                      maxLength={18}
                      className="bg-[#020202] border-[#151515] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 border-t-0 rounded-none transition-all duration-300"
                      style={{ fontFamily: "inherit" }}
                    />

                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Crie uma senha"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={submitting}
                      className="bg-[#020202] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 border-t border-[#151515] rounded-b-md rounded-t-none transition-all duration-300"
                      style={{ fontFamily: "inherit" }}
                    />
                    {registerError && (
                      <div className="flex items-center gap-1 mt-1 text-sm text-red-500">
                        <AlertCircle size={16} />
                        <span>{registerError}</span>
                      </div>
                    )}
                  </div>
                )}

                {stepOtp && (
                  <div className="flex flex-col gap-4 mt-4 items-center w-full">
                    <Field>
                      <FieldLabel htmlFor="otp" className="sr-only">
                        Código OTP
                      </FieldLabel>
                      <InputOTP
                        maxLength={6}
                        id="otp"
                        value={otp}
                        onChange={(value: string) => setOtp(value)}
                        containerClassName="gap-4 w-full justify-center"
                      >
                        <InputOTPGroup className="gap-2.5 *:data-[slot=input-otp-slot]:h-16 *:data-[slot=input-otp-slot]:w-12 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border *:data-[slot=input-otp-slot]:text-xl">
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup className="gap-2.5 *:data-[slot=input-otp-slot]:h-16 *:data-[slot=input-otp-slot]:w-12 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border *:data-[slot=input-otp-slot]:text-xl">
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>

                      {otpError && (
                        <div className="flex items-center gap-1 mt-1 text-sm text-red-500 ml-8.5">
                          <AlertCircle size={16} />
                          <span>{otpError}</span>
                        </div>
                      )}

                      <FieldDescription className="text-center mt-1">
                        O código não foi recebido?{" "}
                        <button
                          type="button"
                          onClick={async () => {
                            if (resending) return
                            setResending(true)
                            try {
                              const res = await fetch("/api/resend-otp", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ email }),
                              })
                              const data = await res.json()
                              if (!res.ok) setOtpError(data.error || "Erro ao reenviar código")
                            } catch {
                              setOtpError("Erro ao reenviar código")
                            } finally {
                              setResending(false)
                            }
                          }}
                          className="text-muted-foreground underline cursor-pointer hover:text-foreground transition-all"
                        >
                          {resending ? "enviando..." : "Reenviar Código"}
                        </button>
                      </FieldDescription>
                    </Field>
                  </div>
                )}

                {/* PASSWORD LOGIN */}
                {step === "password" && (
                  <div
                    className={cn(
                      "relative overflow-hidden transition-all duration-500",
                      showPasswordInput
                        ? "max-h-[120px] opacity-100 translate-y-0"
                        : "max-h-0 opacity-0 -translate-y-6"
                    )}
                  >
                    <div className="relative flex flex-col gap-1 pb-8">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={cn(
                          "bg-[#020202] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 pr-12 rounded-b-md rounded-t-none transition-all duration-500 transform",
                          passwordError ? "border-red-500" : "border-[#151515]",
                          showPasswordInput ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
                        )}
                        style={{ fontFamily: "inherit" }}
                      />

                      {/* Toggle olho */}
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-6 -translate-y-1/2 text-muted-foreground hover:text-foreground opacity-50"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>

                      {/* Erro senha login */}
                      {passwordError && (
                        <div
                          className={cn(
                            "absolute left-0 bottom-1 flex items-center gap-1 text-sm text-red-500 pointer-events-none transition-all duration-300",
                            showPasswordInput ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
                          )}
                        >
                          <AlertCircle size={16} />
                          <span>{passwordError.message}</span>
                        </div>
                      )}

                      {/* botão "Esqueceu a senha?" -> agora abre o fluxo inline */}
                      <div className="absolute right-0 bottom-1 pointer-events-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setForgotStep("request");
                            setForgotEmail(email || "");
                            setForgotError(null);
                          }}
                          className="text-sm opacity-50 hover:opacity-60 underline-offset-4 cursor-pointer transition"
                        >
                          Esqueceu a senha?
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <Field>
            <Button
              type="submit"
              disabled={
                loading ||
                submitting ||
                otpSubmitting ||
                forgotLoading ||
                forgotOtpSubmitting ||
                (stepOtp && otp.length < 6) ||
                (forgotStep === "otp" && forgotOtp.length < 6)
              }
              className="cback text-primary-foreground hover:bg-primary/90 h-13 text-base cursor-pointer flex items-center justify-center -mt-3"
            >
              {forgotStep === "request"
                ? (forgotLoading ? <Loader2 className="animate-spin" size={20} /> : "Continuar")
                : forgotStep === "otp"
                  ? (forgotOtpSubmitting ? <Loader2 className="animate-spin" size={20} /> : "Validar código")
                  : forgotStep === "reset"
                    ? (submitting ? <Loader2 className="animate-spin" size={20} /> : "Salvar nova senha")
                    : step === "email"
                      ? "Next"
                      : submitting || otpSubmitting
                        ? <Loader2 className="animate-spin" size={20} />
                        : stepOtp
                          ? "Validar código"
                          : step === "register"
                            ? "Registrar"
                            : "Login"}
            </Button>
          </Field>
        </FieldGroup>
      </form>

      <FieldDescription className="px-6 text-center text-[12px] opacity-50">
        Todos os direitos reservados ® 2025 Wyze Bank. Ao fazer login, você concorda com nossos{" "}
        <a href="https://support.wyzecode.com/docs/terms-service" target="_blank" rel="noopener noreferrer">
          Termos de Serviço
        </a>{" "}e{" "}
        <a href="https://support.wyzecode.com/docs/policy-politic" target="_blank" rel="noopener noreferrer">
          Política de Privacidade
        </a>.
      </FieldDescription>
    </div>
  )
}

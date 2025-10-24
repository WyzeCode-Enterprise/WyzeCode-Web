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
    e.preventDefault()

    if (step === "email") {
      const { valid, message } = validateEmail(email)
      if (!valid) {
        setEmailError({ message: message || "Email inválido" })
        setShowEmailError(true)
        return
      }
      setEmailError(null)
      setShowEmailError(false)
      setLoading(true)

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })
        const data = await response.json()
        setLoading(false)

        if (data?.newUser) {
          setStep("register")
          return
        }

        setStep("password")
        setShowPasswordInput(true)
      } catch {
        setLoading(false)
        setEmailError({ message: "Erro ao conectar com o servidor" })
      }
    }

    else if (step === "password") {
      const { valid, message } = validatePassword(password)
      if (!valid) {
        setPasswordError({ message: message || "Senha inválida" })
        return
      }
      setPasswordError(null)
      setSubmitting(true)

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        })
        const data = await response.json()
        if (!response.ok) {
          setPasswordError({ message: data.error || "Erro ao logar" })
          setSubmitting(false)
        } else {
          window.location.href = data.redirect
        }
      } catch {
        setPasswordError({ message: "Erro ao conectar com o servidor" })
        setSubmitting(false)
      }
    }

    else if (step === "register") {
      if (!stepOtp) {
        if (!nome || !telefone || !cpfCnpj || !password) {
          setRegisterError("Preencha todos os campos.")
          return
        }
        setRegisterError(null)
        setSubmitting(true)

        try {
          const response = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, nome, telefone, cpfCnpj, password }),
          })
          const data = await response.json()
          setSubmitting(false)

          if (!response.ok) {
            setRegisterError(data.error || "Erro ao registrar")
          } else {
            setStepOtp(true)
          }
        } catch {
          setRegisterError("Erro ao conectar com o servidor")
          setSubmitting(false)
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
  }

  const handleBackToEmail = () => {
    setStep("email");
    setShowPasswordInput(false);
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
  };

  return (
    <div className={cn("flex flex-col gap-8 text-foreground bg-background", className)} {...props}>

      {otpSuccess && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background backdrop-blur-md text-center animate-fade-in px-6">
          <div className="flex flex-col items-center space-y-4 sm:space-y-6">
            <img
              src="./Design sem nome (9).svg"
              alt="Sucesso"
              className="w-60 h-60 sm:w-72 sm:h-72 md:w-80 md:h-80 drop-shadow-[0_0_25px_#26FF5950] transition-transform duration-500 ease-out scale-100"
            />
            <h2 className="text-3xl sm:text-4xl font-bold text-[#26FF59] tracking-tight drop-shadow-[0_0_10px_#26FF5930]">
              Código validado com sucesso!
            </h2>
            <p className="opacity-70 text-base sm:text-lg max-w-lg leading-relaxed text-foreground/80">
              Seu código de validação foi confirmado com êxito.<br />
              Você será redirecionado ao login, aguarde...
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

            <h1 className="text-[27px] font-bold text-foreground">
              Boas-vindas ao Wyze Bank!
            </h1>

            {step === "email" && (
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
            <div className="relative">
              {step !== "email" && (
                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
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

            {step === "password" && (
              <div
                className={cn(
                  "relative overflow-hidden transition-all duration-500",
                  showPasswordInput
                    ? "max-h-[120px] opacity-100 translate-y-0"
                    : "max-h-0 opacity-0 -translate-y-6"
                )}
              >
                <div className="relative flex flex-col gap-1">
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
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-6 -translate-y-1/2 text-muted-foreground hover:text-foreground opacity-50"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>

                  {passwordError && (
                    <div
                      className={cn(
                        "flex items-center gap-1 mt-1 text-sm text-red-500 transition-all duration-500 transform",
                        showPasswordInput ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
                      )}
                    >
                      <AlertCircle size={16} />
                      <span>{passwordError.message}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <Field>
            <Button
              type="submit"
              disabled={loading || submitting || otpSubmitting || (stepOtp && otp.length < 6)}
              className="cback text-primary-foreground hover:bg-primary/90 h-13 text-base cursor-pointer flex items-center justify-center"
            >
              {step === "email"
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
        Todos os direitos reservados © 2025 WyzeCode®. Ao fazer login, você concorda com nossos{" "}
        <a href="https://support.wyzecode.com/docs/terms-service" target="_blank" rel="noopener noreferrer">
          Termos de Serviço
        </a>{" "}
        e{" "}
        <a href="https://support.wyzecode.com/docs/policy-politic" target="_blank" rel="noopener noreferrer">
          Política de Privacidade
        </a>.
      </FieldDescription>
    </div>
  )
}

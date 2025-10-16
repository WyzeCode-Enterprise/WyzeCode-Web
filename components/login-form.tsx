"use client"

import type React from "react"
import { useState } from "react"
import { Loader2, Eye, EyeOff, ArrowLeft, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator
} from "@/components/ui/input-otp"
import { validateEmail, validatePassword } from "@/app/api/emailValidation"

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const [step, setStep] = useState<"email" | "password" | "register">("email")
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [emailError, setEmailError] = useState<{ message: string } | null>(null)
  const [passwordError, setPasswordError] = useState<{ message: string } | null>(null)
  const [showEmailError, setShowEmailError] = useState(true)
  const [showPasswordInput, setShowPasswordInput] = useState(false)

  // Estado OTP
  const [stepOtp, setStepOtp] = useState(false)
  const [otp, setOtp] = useState("")
  const [otpError, setOtpError] = useState<string | null>(null)
  const [otpSubmitting, setOtpSubmitting] = useState(false)
  const [resending, setResending] = useState(false)

  // Campos de registro
  const [nome, setNome] = useState("")
  const [telefone, setTelefone] = useState("")
  const [cpfCnpj, setCpfCnpj] = useState("")
  const [registerError, setRegisterError] = useState<string | null>(null)

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault()

    // ---------------- EMAIL ----------------
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

        // Usuário existente, vai para senha
        setStep("password")
        setShowPasswordInput(true)
      } catch {
        setLoading(false)
        setEmailError({ message: "Erro ao conectar com o servidor" })
      }
    }

    // ---------------- PASSWORD ----------------
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

    // ---------------- REGISTER ----------------
    else if (step === "register") {
      // Primeiro passo: enviar OTP
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
            setStepOtp(true) // ativa passo OTP
          }
        } catch {
          setRegisterError("Erro ao conectar com o servidor")
          setSubmitting(false)
        }
      }
     // segundo passo: validar OTP
else if (stepOtp && otp.length === 6) {
  setOtpSubmitting(true); // ativa loader

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nome, telefone, cpfCnpj, password, otp }),
    });

    const data = await response.json();

    if (!response.ok) {
      setOtpError(data.error || "Erro ao validar OTP");
      setOtpSubmitting(false);
    } else {
      // espera 2s antes de trocar a tela (simula o loader do backend)
      setTimeout(() => {
        setStep("email");      // reinicia fluxo para login
        setOtp("");
        setStepOtp(false);
        setEmail(data.email);  // preenche email
        setPassword("");
        setOtpError(null);
        setSubmitting(false);
        setOtpSubmitting(false); // garante que o botão Next funcione
      }, 2000);
    }
  } catch {
    setOtpError("Erro ao conectar com o servidor");
    setOtpSubmitting(false);
  }
}
    }
  }

  const handleBackToEmail = () => {
    setStep("email")
    setShowPasswordInput(false)
  }

  return (
    <div className={cn("flex flex-col gap-8 text-foreground bg-background", className)} {...props}>
      <form onSubmit={handleNext} autoComplete="on">
        <FieldGroup>
          {/* Logo e título */}
          <div className="flex flex-col items-center gap-4 text-center">
            <a href="/login" className="flex flex-col items-center gap-3 font-medium text-foreground">
              <img
                className="h-14 w-14"
                src="https://wyzebank.com/lg_files_wb/svg_files/icon_green_black.svg"
                alt="Logo Wyze Bank"
              />
            </a>
            <h1 className="text-[27px] font-bold text-foreground">Welcome to Wyze Bank.</h1>
            <FieldDescription className="text-[15px] text-muted-foreground">
              Having trouble logging in? <a href="#">Support</a>
            </FieldDescription>
          </div>

          {/* INPUT EMAIL */}
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

            {/* Mensagem de erro email */}
            {emailError && (
              <div className="flex items-center gap-1 mt-1 text-sm text-red-500">
                <AlertCircle size={16} />
                <span>{emailError.message}</span>
              </div>
            )}

            {/* CAMPOS REGISTRO */}
{step === "register" && !stepOtp && (
  <div className="flex flex-col transition-all duration-500 mt-4">
    <Input
      type="text"
      placeholder="Nome completo"
      value={nome}
      onChange={(e) => setNome(e.target.value)}
      disabled={submitting} // <-- bloqueia enquanto envia
      className="bg-[#020202] border-[#151515] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 border-t-md rounded-t-md rounded-b-none transition-all duration-300"
      style={{ fontFamily: "inherit" }}
    />
{/* Número de telefone com máscara */}
{/* Telefone com máscara internacional +55 */}
{/* Telefone com máscara dinâmica */}
<Input
  type="text"
  placeholder="Número de telefone (ex: +55 11 99999-9999)"
  value={telefone}
  onChange={(e) => {
    let val = e.target.value.replace(/\D/g, "");
    // +CC (2) + DDD (2) + número (9) = 13 dígitos
    if (val.length > 13) val = val.slice(0, 13);

    let formatted = "";
    if (val.length > 0) formatted = "+" + val.slice(0, 2);        // CC
    if (val.length >= 3) formatted += " " + val.slice(2, 4);       // DDD
    if (val.length >= 5) formatted += " " + val.slice(4, 9);       // primeira parte (5)
    if (val.length >= 10) formatted += "-" + val.slice(9, 13);     // segunda parte (4)

    setTelefone(formatted);
  }}
  onBlur={() => {
    // opcional: normalizar e validar localmente antes de enviar
    const digits = telefone.replace(/\D/g, "");
    if (digits.length !== 13) {
      // você pode setar um erro de UI aqui
    }
  }}
  onKeyDown={(e) => {
    if (!/[0-9]/.test(e.key) && e.key !== "Backspace" && e.key !== "Delete") {
      e.preventDefault();
    }
  }}
  disabled={submitting}
  maxLength={17} // "+55 11 99999-9999" tem 17
  className="bg-[#020202] border-[#151515] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 border-t-0 rounded-none transition-all duration-300"
  style={{ fontFamily: "inherit" }}
/>



<Input
  type="text"
  placeholder="CPF ou CNPJ"
  value={cpfCnpj}
  onChange={(e) => {
    let val = e.target.value.replace(/\D/g, ""); // só números

    if (val.length <= 11) {
      // CPF: 000.000.000-00
      val = val.slice(0, 11);
      let formatted = val;
      if (val.length > 3) formatted = val.slice(0, 3) + "." + val.slice(3);
      if (val.length > 6) formatted = formatted.slice(0, 7) + "." + formatted.slice(7);
      if (val.length > 9) formatted = formatted.slice(0, 11) + "-" + formatted.slice(11);
      setCpfCnpj(formatted);
    } else {
      // CNPJ: 00.000.000/0001-00
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


{/* Senha */}
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

            {/* OTP */}
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
                    Didn't receive the code?{" "}
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
                      className="text-muted-foreground underline"
                    >
                      {resending ? "Sending..." : "Resend"}
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

      <FieldDescription className="px-6 text-center text-muted-foreground text-[12px]">
        All rights reserved © 2025 WyzeCode®. By logging in, you agree to our{" "}
        <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}

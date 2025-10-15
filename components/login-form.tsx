"use client"

import type React from "react"
import { useState } from "react"
import { Loader2, Eye, EyeOff, ArrowLeft, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { validateEmail, validatePassword } from "@/app/api/emailValidation"

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const [step, setStep] = useState<"email" | "password">("email")
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [emailError, setEmailError] = useState<{ message: string } | null>(null)
  const [passwordError, setPasswordError] = useState<{ message: string } | null>(null)
  const [showEmailError, setShowEmailError] = useState(true)
  const [showPasswordInput, setShowPasswordInput] = useState(false)

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
      setTimeout(() => {
        setLoading(false)
        setStep("password")
        setShowPasswordInput(true)
      }, 1500)
    } else {
      const { valid, message } = validatePassword(password)
      if (!valid) {
        setPasswordError({ message: message || "Senha inválida" })
        return
      }
      setPasswordError(null)

      setSubmitting(true)
      const form = e.currentTarget as HTMLFormElement
      form.reportValidity()
      setTimeout(() => {
        console.log("Login:", { email, password })
        setSubmitting(false)
      }, 1500)
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
          <div className="flex flex-col items-center gap-4 text-center">
            <a href="/login" className="flex flex-col items-center gap-3 font-medium text-foreground">
              <img className="h-14 w-14" src="lg_files_wb/svg_files/icon_green_black.svg" alt=""/>
            </a>
            <h1 className="text-[27px] font-bold text-foreground">Welcome to Wyze Bank.</h1>
            <FieldDescription className="text-[15px] text-muted-foreground">
              Having trouble logging in? <a href="#">Support</a>
            </FieldDescription>
          </div>

          {/* Email Input */}
          <div className="relative flex flex-col">
            <div className="relative">
              {step === "password" && (
                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <Input
                id="email"
                name="username"
                type="text"
                placeholder="m@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={step === "password" || loading}
                autoComplete="off"
                onFocus={() => setShowEmailError(false)}
                onBlur={() => emailError && setShowEmailError(true)}
                className={cn(
                  "bg-[#050505] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 pr-12 duration-300 rounded-t-md font-sans transition-all",
                  emailError ? "border-red-500" : "border-[#2a2a2a]",
                  step === "password" ? "rounded-b-none" : "",
                  loading ? "opacity-100" : "",
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

            {/* Mensagem de erro do email */}
            <div
              className={cn(
                "flex items-center gap-1 mt-1 text-sm text-red-500 overflow-hidden transition-all duration-300",
                showEmailError && emailError
                  ? "max-h-10 opacity-100 translate-y-0"
                  : "max-h-0 opacity-0 translate-y-2"
              )}
            >
              {emailError && (
                <>
                  <AlertCircle size={16} />
                  <span className="truncate max-w-[calc(100%-32px)]">{emailError.message}</span>
                </>
              )}
            </div>

            {/* Password Input */}
            <div
              className={cn(
                "relative overflow-hidden transition-all duration-500",
                showPasswordInput
                  ? "max-h-[120px] opacity-100 -translate-y-1.5"
                  : "max-h-0 opacity-0 -translate-y-2"
              )}
            >
              {step === "password" && (
                <>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setPasswordError(null)}
                      className={cn(
                        "bg-[#050505] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 pr-12 rounded-b-md rounded-t-none font-sans transition-all duration-300",
                        passwordError ? "border-red-500" : "border-[#2a2a2a]"
                      )}
                      style={{ fontFamily: "inherit" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground opacity-50"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>

                  {/* Mensagem de erro da senha */}
                  <div
                    className={cn(
                      "flex items-center gap-1 mt-1 text-sm text-red-500 transition-all duration-300",
                      passwordError ? "max-h-10 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-2"
                    )}
                  >
                    {passwordError && (
                      <>
                        <AlertCircle size={16} />
                        <span className="truncate max-w-[calc(100%-32px)]">{passwordError.message}</span>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <Field>
            <Button
              type="submit"
              disabled={loading || submitting}
              className="cback text-primary-foreground hover:bg-primary/90 h-13 text-base cursor-pointer flex items-center justify-center"
            >
              {step === "email" ? "Next" : submitting ? <Loader2 className="animate-spin" size={20} /> : "Login"}
            </Button>
          </Field>
        </FieldGroup>
      </form>

      <FieldDescription className="px-6 text-center text-muted-foreground text-[12px]">
        All rights reserved © 2025 WyzeCode®. By logging in, you agree to our <a href="#">Terms of Service</a> and{" "}
        <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}

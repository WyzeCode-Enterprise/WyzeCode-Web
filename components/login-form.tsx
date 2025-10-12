"use client"

import type React from "react"
import { useState } from "react"
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const [step, setStep] = useState<"email" | "password">("email")
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault()

    if (step === "email") {
      setLoading(true)
      setTimeout(() => {
        setLoading(false)
        setStep("password")
      }, 1500)
    } else {
      // Mostra loader no botão
      setSubmitting(true)

      // Gatilho para salvar senha
      const form = e.currentTarget as HTMLFormElement
      form.reportValidity() // garante que campos estão válidos
      setTimeout(() => {
        console.log("Login:", { email, password })
        setSubmitting(false)
      }, 1500)
    }
  }

  return (
    <div className={cn("flex flex-col gap-8 text-foreground bg-background", className)} {...props}>
      <form onSubmit={handleNext} autoComplete="on">
        <FieldGroup>
          <div className="flex flex-col items-center gap-4 text-center">
            <a href="/login" className="flex flex-col items-center gap-3 font-medium text-foreground">
              <img className="h-14 w-14" src="Clyze_Logo/icon_green_black.png" alt=""/>
            </a>
            <h1 className="text-[27px] font-bold text-foreground">Welcome to Clyze LTDA.</h1>
            <FieldDescription className="text-[15px] text-muted-foreground">
              Having trouble logging in? <a href="#">Support</a>
            </FieldDescription>
          </div>

          {/* Email + Password Inputs */}
          <div className="relative flex flex-col">
            <div className="relative">
              {step === "password" && (
                <button
                  type="button"
                  onClick={() => setStep("email")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <Input
                id="email"
                name="username"
                type="email"
                placeholder="m@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={step === "password" || loading}
                className={cn(
                  "bg-[#0a0a0a] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 duration-300 rounded-t-md font-sans",
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

            {step === "password" && (
              <div
                className={cn(
                  "relative overflow-hidden",
                  step === "password" ? "password-enter-active" : "password-exit-active"
                )}
              >
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[#0a0a0a] text-foreground placeholder:text-[16px] placeholder:text-muted-foreground h-13 px-5 rounded-b-md rounded-t-none font-sans border border-[#2a2a2a]"
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
            )}
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

          <FieldSeparator className="text-muted-foreground text-base">or</FieldSeparator>

          <Field className="grid gap-4 sm:grid-cols-2">
            <Button
              variant="outline"
              type="button"
              className="border-border text-foreground hover:bg-muted/10 h-13 text-[14px] bg-transparent cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 48 48">
                <path
                  fill="#FFC107"
                  d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
                ></path>
                <path
                  fill="#FF3D00"
                  d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
                ></path>
                <path
                  fill="#4CAF50"
                  d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
                ></path>
                <path
                  fill="#1976D2"
                  d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
                ></path>
              </svg>
              Continue with Google
            </Button>
            <Button
              variant="outline"
              type="button"
              className="border-border text-foreground hover:bg-muted/10  h-13 text-[14px] bg-transparent cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                x="0px"
                y="0px"
                width="100"
                height="100"
                viewBox="0 0 50 50"
                fill="white"
              >
                <path d="M 44.527344 34.75 C 43.449219 37.144531 42.929688 38.214844 41.542969 40.328125 C 39.601563 43.28125 36.863281 46.96875 33.480469 46.992188 C 30.46875 47.019531 29.691406 45.027344 25.601563 45.0625 C 21.515625 45.082031 20.664063 47.03125 17.648438 47 C 14.261719 46.96875 11.671875 43.648438 9.730469 40.699219 C 4.300781 32.429688 3.726563 22.734375 7.082031 17.578125 C 9.457031 13.921875 13.210938 11.773438 16.738281 11.773438 C 20.332031 11.773438 22.589844 13.746094 25.558594 13.746094 C 28.441406 13.746094 30.195313 11.769531 34.351563 11.769531 C 37.492188 11.769531 40.8125 13.480469 43.1875 16.433594 C 35.421875 20.691406 36.683594 31.78125 44.527344 34.75 Z M 31.195313 8.46875 C 32.707031 6.527344 33.855469 3.789063 33.4375 1 C 30.972656 1.167969 28.089844 2.742188 26.40625 4.78125 C 24.878906 6.640625 23.613281 9.398438 24.105469 12.066406 C 26.796875 12.152344 29.582031 10.546875 31.195313 8.46875 Z"></path>
              </svg>
              Continue with Microsoft
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

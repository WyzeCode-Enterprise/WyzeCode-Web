import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-[450px]">
        <LoginForm />
      </div>
    </div>
  )
}

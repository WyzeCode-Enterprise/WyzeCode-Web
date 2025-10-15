// app/api/redirectsystem/route.ts
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const target = url.searchParams.get("to")

  // Map de redirecionamentos permitidos
  const redirects: Record<string, string> = {
    wyzebank: "https://wyzebank.com",
    myshop: "https://myshop.com",
  }

  if (target && redirects[target]) {
    return NextResponse.redirect(redirects[target])
  }

  // Caso não exista, volta para home
  return NextResponse.redirect("/")
}

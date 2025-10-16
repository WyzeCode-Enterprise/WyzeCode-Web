// app/img/route.ts
import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import fetch from "node-fetch"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const src = searchParams.get("src")

    if (!src) return NextResponse.json({ error: "No src provided" }, { status: 400 })

    // Caminho local
    const localPath = path.join(process.cwd(), src)
    if (fs.existsSync(localPath)) {
      const fileBuffer = fs.readFileSync(localPath)
      return new NextResponse(fileBuffer, { status: 200, headers: { "Content-Type": "image/svg+xml" } })
    }

    // URL absoluta
    const absoluteURL = `https://wyzebank.com/${src}`
    try {
      const res = await fetch(absoluteURL)
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer()
        return new NextResponse(Buffer.from(arrayBuffer), { status: 200, headers: { "Content-Type": "image/svg+xml" } })
      }
    } catch (err) {
      console.error("Erro ao buscar URL absoluta:", err)
    }

    // Fallback final: devolve o local mesmo se não existir
    return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

import { NextResponse } from "next/server";

export async function GET() {
  // Aqui futuramente você pode checar status da verificação
  return NextResponse.json({
    ok: true,
    message: "GET /pending-v ativo. Nenhuma ação ainda.",
  });
}

export async function POST(request: Request) {
  // Aqui futuramente você poderia receber body com { front, back }
  // e mandar pro seu backend / provedor KYC
  try {
    const body = await request.json().catch(() => ({}));

    // body.front e body.back podem ser base64
    // Faz a validação que você quiser aqui.

    return NextResponse.json({
      ok: true,
      received: {
        hasFront: !!body.front,
        hasBack: !!body.back,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "Erro processando POST /pending-v",
      },
      { status: 400 }
    );
  }
}

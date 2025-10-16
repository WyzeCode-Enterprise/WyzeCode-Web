import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("wzb_lg")?.value;

  if (!token) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET || "supersecretkey");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}

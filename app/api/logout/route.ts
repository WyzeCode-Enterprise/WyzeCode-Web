import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const response = NextResponse.redirect(`${origin}/login`);

  response.cookies.set("wzb_lg", "", { path: "/", maxAge: 0 });
  response.cookies.set("wzb_lg_e", "", { path: "/", maxAge: 0 });

  return response;
}
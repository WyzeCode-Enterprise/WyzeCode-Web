// app/api/geoip/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ip = url.searchParams.get("ip");
  if (!ip) return NextResponse.json({ error: "missing ip" }, { status: 400 });

  // exemplo: IPinfo
  const token = process.env.IPINFO_TOKEN;
  const res = await fetch(`https://ipinfo.io/${ip}/json?token=${token}`);
  if (!res.ok) return NextResponse.json({ error: "geoip-failed" }, { status: 502 });
  const data = await res.json();
  return NextResponse.json({ country: data.country, city: data.city });
}

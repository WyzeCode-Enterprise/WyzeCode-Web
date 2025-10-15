// components/LanguageSwitcher.tsx
"use client";
import { useRouter } from "next/navigation";

export function LanguageSwitcher() {
  const router = useRouter();
  function setLang(l: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", l);
    window.location.href = url.toString();
  }
  return (
    <div>
      <button onClick={() => setLang("pt-BR")}>PT-BR</button>
      <button onClick={() => setLang("en-US")}>EN</button>
    </div>
  );
}

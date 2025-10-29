"use client";

import React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import { SectionCards } from "@/components/section-cards";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { VerifyDocumentsSection } from "@/components/alert-pending";
import data from "../dash/data.json";
import { useAuth } from "../hooks/useAuth";

// props que vêm do server (/dash/page.tsx)
interface DashClientProps {
  userId: number;          // <-- adicionamos isso
  userName: string;
  userEmail: string;
  userCpfOrCnpj: string;
  userPhone: string;
  degraded?: boolean;
}

export default function DashClient({
  userId,
  userName,
  userEmail,
  userCpfOrCnpj,
  userPhone,
  degraded,
}: DashClientProps) {
  useAuth();

  // corta nome pra não quebrar sidebar visualmente
  const displayName =
    userName.length > 25 ? userName.slice(0, 25) + "..." : userName;

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        userName={displayName}
        userEmail={userEmail}
      />

      <SidebarInset>
        <SiteHeader />

        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 max-w-[90rem] lg:mx-auto lg:w-full lg:px-0">

              {/* aviso de degradação opcional */}
              {degraded && (
                <div className="mx-4 lg:mx-6 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-[12px] leading-relaxed text-yellow-200">
                  Alguns dados podem estar temporariamente indisponíveis.
                </div>
              )}

              {/* BLOCO: verificação de identidade (alert + drawer) */}
              <div className="px-4 lg:px-6">
                <VerifyDocumentsSection
                  user={{
                    id: userId,                // <-- agora passamos o ID
                    name: userName,
                    email: userEmail,
                    cpfOrCnpj: userCpfOrCnpj,
                    phone: userPhone,
                  }}
                />
              </div>

              {/* cards principais do dashboard */}
              <SectionCards />

              {/* gráfico */}
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
              </div>

              {/* tabela (por ex. atividades recentes) */}
              <DataTable data={data} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

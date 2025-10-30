"use client"

import * as React from "react"
import {
  BookOpen,
  Bot,
  Frame,
  GalleryVerticalEnd,
  Map,
  PieChart,
  Settings2,
  ShoppingCart,
  Sparkles,
  CreditCard,
  Bell,
  BadgeCheck,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userName: string
  userEmail: string
}

export function AppSidebar({ userName, userEmail, ...props }: AppSidebarProps) {
  const [activeItem, setActiveItem] = React.useState("Painel de Controle")

  // Passa o nome completo
  const data = {
    user: {
      name: userName,
      email: userEmail,
      avatar: " ",
    },
    teams: [
      {
        name: "Wyze Bank.",
        logo: GalleryVerticalEnd,
        plan: "Principal",
        url: "https://wyzebank.com",
      }
    ],
    navMain: [
    {
  title: "Painel de Controle",
  url: "#",
  icon: PieChart,
  items: [
    { title: "Visão Geral", url: "/dash" },
    { title: "Atividades Recentes", url: "/dash/recent-activities" },
    { title: "Notificações", url: "#" },
  ],
},
{
  title: "Contas e Carteiras",
  url: "#",
  icon: CreditCard,
  items: [
    { title: "Minha Conta", url: "#" },
    { title: "Adicionar Conta", url: "#" },
    { title: "Cartões", url: "#" },
    { title: "Histórico de Transações", url: "#" },
  ],
},
{
  title: "Pagamentos e Recebimentos",
  url: "#",
  icon: ShoppingCart,
  items: [
    { title: "Enviar Dinheiro", url: "#" },
    { title: "Receber Pagamentos", url: "#" },
    { title: "Faturas", url: "#" },
    { title: "Pagamentos Agendados", url: "#" },
  ],
},
{
  title: "Integrações / Gateway",
  url: "#",
  icon: Bot,
  items: [
    { title: "Chaves de API", url: "#" },
    { title: "Webhooks", url: "#" },
    { title: "Pagamentos Online", url: "#" },
    { title: "Relatórios de Pagamento", url: "#" },
  ],
},
{
  title: "Relatórios e Análises",
  url: "#",
  icon: Map,
  items: [
    { title: "Transações", url: "#" },
    { title: "Relatórios Financeiros", url: "#" },
    { title: "Gráficos e Indicadores", url: "#" },
  ],
},
{
  title: "Segurança e Configurações",
  url: "#",
  icon: Settings2,
  items: [
    { title: "Configurações da Conta", url: "#" },
    { title: "Autenticação", url: "#" },
    { title: "Permissões", url: "#" },
    { title: "Limites de Pagamento", url: "#" },
  ],
},
{
  title: "Suporte e Documentação",
  url: "#",
  icon: BookOpen,
  items: [
    { title: "Ajuda", url: "#" },
    { title: "Documentação da API", url: "#" },
    { title: "Status do Sistema", url: "#" },
  ],
}

    ],
    projects: [
      { name: "My Invoices", url: "#", icon: CreditCard },
      { name: "Scheduled Payments", url: "#", icon: ShoppingCart },
      { name: "Account Alerts", url: "#", icon: Bell },
      { name: "Advanced Reports", url: "#", icon: Sparkles },
      { name: "Recent Transactions", url: "#", icon: Map },
      { name: "Connected Wallets", url: "#", icon: BadgeCheck },
      { name: "Quick Settings", url: "#", icon: Frame },
    ],
  }

  const handleSetActive = (title: string) => setActiveItem(title)

  const navWithActive = data.navMain.map((item) => ({
    ...item,
    isActive: item.title === activeItem,
    onClick: () => handleSetActive(item.title),
    className: item.title === activeItem
      ? "bg-muted/60 text-primary rounded-md"
      : "hover:bg-muted/40 rounded-md",
  }))

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher
          teams={data.teams.map(team => ({
            ...team,
            onClick: () => window.open(team.url, "_blank"),
          }))}
        />
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navWithActive} />
        <NavProjects projects={data.projects} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

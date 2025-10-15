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
  SquareTerminal,
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

const data = {
  user: {
    name: "Your name",
    email: "email@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "Wyze Bank.",
      logo: GalleryVerticalEnd,
      plan: "Principal",
      url: "https://wyzebank.com", // link do time
    }
  ],
  navMain: [
{
    title: "Dashboard",
    url: "#",
    icon: PieChart,
    items: [
      { title: "Visão Geral", url: "#" },
      { title: "Atividades Recentes", url: "#" },
      { title: "Notificações", url: "#" },
    ],
  },
  {
    title: "Contas e Carteiras",
    url: "#",
    icon: CreditCard,
    items: [
      { title: "Minha Conta", url: "#" },
      { title: "Adicionar Contaa", url: "#" },
      { title: "Cartões", url: "#" },
      { title: "Histórico de Movimentos", url: "#" },
    ],
  },
  {
    title: "Pagamentos e Recebimentos",
    url: "#",
    icon: ShoppingCart,
    items: [
      { title: "Enviar Dinheiro", url: "#" },
      { title: "Receber Pagamentos", url: "#" },
      { title: "Cobranças", url: "#" },
      { title: "Pagamentos Agendados", url: "#" },
    ],
  },
  {
    title: "Integrações / Gateway",
    url: "#",
    icon: Bot,
    items: [
      { title: "Chaves API", url: "#" },
      { title: "Webhooks", url: "#" },
      { title: "Pagamentos Online", url: "#" },
      { title: "Relatórios de Pagamento", url: "#" },
    ],
  },
  {
    title: "Relatórios e Analytics",
    url: "#",
    icon: Map,
    items: [
      { title: "Transações", url: "#" },
      { title: "Relatórios Financeiros", url: "#" },
      { title: "Gráficos e KPIs", url: "#" },
    ],
  },
  {
    title: "Segurança e Configurações",
    url: "#",
    icon: Settings2,
    items: [
      { title: "Configurações de Conta", url: "#" },
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
      { title: "API Docs", url: "#" },
      { title: "Status do Sistema", url: "#" },
    ],
  }
  ],
  projects: [
  { name: "Minhas Faturas", url: "#", icon: CreditCard },
  { name: "Pagamentos Agendados", url: "#", icon: ShoppingCart },
  { name: "Alertas de Conta", url: "#", icon: Bell },
  { name: "Relatórios Avançados", url: "#", icon: Sparkles },
  { name: "Transações Recentes", url: "#", icon: Map },
  { name: "Carteiras Conectadas", url: "#", icon: BadgeCheck },
  { name: "Configurações Rápidas", url: "#", icon: Frame },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [activeItem, setActiveItem] = React.useState("Dashboard")

  // Atualiza o item ativo
  const handleSetActive = (title: string) => {
    setActiveItem(title)
  }

  // Propaga o estado ativo para NavMain
  const navWithActive = data.navMain.map((item) => ({
    ...item,
    isActive: item.title === activeItem,
    onClick: () => handleSetActive(item.title),
    // adiciona classe para background ativo
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
            onClick: () => window.open(team.url, "_blank"), // abre link em nova aba
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

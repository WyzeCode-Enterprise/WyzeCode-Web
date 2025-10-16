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
  const [activeItem, setActiveItem] = React.useState("Dashboard")

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
        title: "Dashboard",
        url: "#",
        icon: PieChart,
        items: [
          { title: "Overview", url: "#" },
          { title: "Recent Activities", url: "#" },
          { title: "Notifications", url: "#" },
        ],
      },
      {
        title: "Accounts & Wallets",
        url: "#",
        icon: CreditCard,
        items: [
          { title: "My Account", url: "#" },
          { title: "Add Account", url: "#" },
          { title: "Cards", url: "#" },
          { title: "Transaction History", url: "#" },
        ],
      },
      {
        title: "Payments & Receipts",
        url: "#",
        icon: ShoppingCart,
        items: [
          { title: "Send Money", url: "#" },
          { title: "Receive Payments", url: "#" },
          { title: "Invoices", url: "#" },
          { title: "Scheduled Payments", url: "#" },
        ],
      },
      {
        title: "Integrations / Gateway",
        url: "#",
        icon: Bot,
        items: [
          { title: "API Keys", url: "#" },
          { title: "Webhooks", url: "#" },
          { title: "Online Payments", url: "#" },
          { title: "Payment Reports", url: "#" },
        ],
      },
      {
        title: "Reports & Analytics",
        url: "#",
        icon: Map,
        items: [
          { title: "Transactions", url: "#" },
          { title: "Financial Reports", url: "#" },
          { title: "Charts & KPIs", url: "#" },
        ],
      },
      {
        title: "Security & Settings",
        url: "#",
        icon: Settings2,
        items: [
          { title: "Account Settings", url: "#" },
          { title: "Authentication", url: "#" },
          { title: "Permissions", url: "#" },
          { title: "Payment Limits", url: "#" },
        ],
      },
      {
        title: "Support & Documentation",
        url: "#",
        icon: BookOpen,
        items: [
          { title: "Help", url: "#" },
          { title: "API Docs", url: "#" },
          { title: "System Status", url: "#" },
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

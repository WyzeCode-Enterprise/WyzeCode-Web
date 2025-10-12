import { DashboardHeader } from "@/components/dashboard-header"
import { Card } from "@/components/ui/card"

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container mx-auto px-6 py-8">
        <div className="space-y-8">
          {/* Welcome Section */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Bem-vindo de volta!</h1>
            <p className="text-muted-foreground">Aqui está um resumo das suas atividades</p>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="p-6 rounded-2xl border-border">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total de Projetos</p>
                <p className="text-3xl font-bold">12</p>
                <p className="text-xs text-muted-foreground">+2 este mês</p>
              </div>
            </Card>

            <Card className="p-6 rounded-2xl border-border">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Tarefas Concluídas</p>
                <p className="text-3xl font-bold">48</p>
                <p className="text-xs text-muted-foreground">+12 esta semana</p>
              </div>
            </Card>

            <Card className="p-6 rounded-2xl border-border">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Membros da Equipe</p>
                <p className="text-3xl font-bold">8</p>
                <p className="text-xs text-muted-foreground">+1 este mês</p>
              </div>
            </Card>

            <Card className="p-6 rounded-2xl border-border">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Taxa de Conclusão</p>
                <p className="text-3xl font-bold">87%</p>
                <p className="text-xs text-muted-foreground">+5% este mês</p>
              </div>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card className="p-6 rounded-2xl border-border">
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Atividades Recentes</h2>
              <div className="space-y-4">
                {[
                  { title: "Novo projeto criado", time: "Há 2 horas", type: "create" },
                  { title: "Tarefa concluída: Design do sistema", time: "Há 4 horas", type: "complete" },
                  { title: "Membro adicionado à equipe", time: "Há 1 dia", type: "team" },
                  { title: "Relatório mensal gerado", time: "Há 2 dias", type: "report" },
                ].map((activity, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 pb-4 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}

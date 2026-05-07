import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/contexts/app-context'

const evolutionData = [
  { name: 'Seg', registros: 4 },
  { name: 'Ter', registros: 7 },
  { name: 'Qua', registros: 5 },
  { name: 'Qui', registros: 9 },
  { name: 'Sex', registros: 12 },
  { name: 'Sáb', registros: 3 },
]

const productivityData = [
  { name: 'Equipe A', atual: 9, meta: 8 },
  { name: 'Equipe B', atual: 6, meta: 8 },
  { name: 'Equipe C', atual: 11, meta: 8 },
]

const goalData = [
  { name: 'Concluído', value: 145 },
  { name: 'Restante', value: 96 },
]
const COLORS = ['hsl(var(--primary))', 'hsl(var(--muted))']

export default function Dashboard() {
  const { products } = useApp()
  const idleProducts = products.filter((p) => p.daysIdle > 5)

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard da Fábrica</h1>
        <p className="text-muted-foreground">
          Visão geral de produtividade e evolução de cadastros.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução Diária</CardTitle>
            <CardDescription>Cadastros nos últimos 7 dias</CardDescription>
          </CardHeader>
          <CardContent className="h-[200px]">
            <ChartContainer
              config={{ registros: { color: 'hsl(var(--primary))', label: 'Registros' } }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={evolutionData}>
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="registros"
                    stroke="var(--color-registros)"
                    fill="var(--color-registros)"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Produtividade da Equipe</CardTitle>
            <CardDescription>Meta: 8 cadastros/dia</CardDescription>
          </CardHeader>
          <CardContent className="h-[200px]">
            <ChartContainer
              config={{
                atual: { color: 'hsl(var(--primary))', label: 'Atual' },
                meta: { color: 'hsl(var(--chart-2))', label: 'Meta' },
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productivityData}>
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="atual" fill="var(--color-atual)" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="meta"
                    fill="var(--color-meta)"
                    radius={[4, 4, 0, 0]}
                    opacity={0.5}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Progresso da Meta</CardTitle>
            <CardDescription>Total de 241 registros</CardDescription>
          </CardHeader>
          <CardContent className="h-[200px] flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={goalData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {goalData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold">145</span>
              <span className="text-xs text-muted-foreground">/ 241</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cadastros Parados (Mais de 5 dias)</CardTitle>
          <CardDescription>Atenção necessária para itens ociosos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última Atualização</TableHead>
                <TableHead className="text-right">Dias Parado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {idleProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nenhum cadastro parado encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                idleProducts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.status}</Badge>
                    </TableCell>
                    <TableCell>{p.lastUpdate}</TableCell>
                    <TableCell className="text-right text-destructive font-bold">
                      {p.daysIdle} dias
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

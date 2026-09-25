import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Plus, Check, Pencil, Layers, Info } from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'
import { useToast } from '@/hooks/use-toast'
import {
  PcpMaterialMinLevel,
  MaterialMinLevelAlertItem,
  setMaterialMinLevel,
} from '@/services/material-min-levels'

interface MaterialMinLevelAlertBlockProps {
  alerts: MaterialMinLevelAlertItem[]
  allMinLevels: PcpMaterialMinLevel[]
  isManager: boolean
  onReload: () => void
  onEditItem?: (item: { code: string; description?: string; minLevel?: number }) => void
}

export function MaterialMinLevelAlertBlock({
  alerts,
  allMinLevels,
  isManager,
  onEditItem,
}: MaterialMinLevelAlertBlockProps) {
  return (
    <Card className="border-amber-300 dark:border-amber-700/60 bg-amber-50/30 dark:bg-amber-950/20 shadow-xs">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-amber-950 dark:text-amber-100">
            <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Alerta de Estoque Mínimo (Disponível abaixo da Margem de Segurança)</span>
            {alerts.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs font-bold">
                {alerts.length} item(ns)
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-1">
            Compara o saldo disponível real (estoque total − reservas ativas) com a meta mínima
            cadastrada no componente. Apenas itens em situação de déficit aparecem aqui.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {allMinLevels.length === 0 ? (
          /* Estado Vazio: Nenhum nível cadastrado ainda */
          <div className="p-6 rounded-lg border border-dashed border-amber-300 dark:border-amber-800 bg-white/70 dark:bg-slate-900/60 text-center space-y-2">
            <Info className="size-8 mx-auto text-amber-600 dark:text-amber-400 opacity-80" />
            <h4 className="font-semibold text-sm text-foreground">
              Nenhum nível mínimo configurado
            </h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Defina o Estoque Mínimo Desejado clicando no botão &ldquo;Editar&rdquo; de qualquer
              item na tabela de estoque abaixo. O sistema alertará automaticamente quando o
              disponível (total − reservado) ficar abaixo da meta.
            </p>
          </div>
        ) : alerts.length === 0 ? (
          /* Todos os itens cadastrados estão normais */
          <div className="p-6 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 text-center space-y-1.5">
            <Check className="size-7 mx-auto text-emerald-600 dark:text-emerald-400" />
            <h4 className="font-bold text-sm text-emerald-800 dark:text-emerald-300">
              Todos os {allMinLevels.length} componentes monitorados estão com estoque disponível
              dentro do nível mínimo!
            </h4>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
              Nenhum déficit de estoque foi identificado no momento.
            </p>
          </div>
        ) : (
          /* Tabela de Alertas */
          <div className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900 overflow-hidden">
            <Table>
              <TableHeader className="bg-amber-100/50 dark:bg-amber-950/40 text-[11px]">
                <TableRow>
                  <TableHead className="w-[120px] font-bold text-amber-950 dark:text-amber-200">
                    Código
                  </TableHead>
                  <TableHead className="font-bold text-amber-950 dark:text-amber-200">
                    Descrição do Componente
                  </TableHead>
                  <TableHead className="text-right w-[100px] font-bold text-amber-950 dark:text-amber-200">
                    Estoque Total
                  </TableHead>
                  <TableHead className="text-right w-[100px] font-bold text-amber-950 dark:text-amber-200">
                    Reservado
                  </TableHead>
                  <TableHead className="text-right w-[100px] font-bold text-amber-950 dark:text-amber-200">
                    Disponível
                  </TableHead>
                  <TableHead className="text-right w-[110px] font-bold text-amber-950 dark:text-amber-200">
                    Nível Mínimo
                  </TableHead>
                  <TableHead className="text-right w-[120px] font-bold text-amber-950 dark:text-amber-200">
                    Diferença (Falta)
                  </TableHead>
                  {isManager && onEditItem && (
                    <TableHead className="w-[90px] text-center font-bold text-amber-950 dark:text-amber-200">
                      Ação
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {alerts.map((item) => (
                  <TableRow
                    key={item.code}
                    className="hover:bg-amber-50/50 dark:hover:bg-amber-950/30 bg-red-50/30 dark:bg-red-950/10"
                  >
                    <TableCell className="font-mono font-bold text-slate-800 dark:text-slate-200 notranslate">
                      {item.code}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      <NoTranslate as="span">{item.description || '—'}</NoTranslate>
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground notranslate">
                      {item.totalStock} {item.unit}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-amber-700 dark:text-amber-400 notranslate">
                      {item.reservedStock} {item.unit}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100 notranslate">
                      {item.availableStock} {item.unit}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-slate-700 dark:text-slate-300 notranslate">
                      {item.minLevel} {item.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="destructive"
                        className="font-mono font-bold text-[11px] px-2 py-0.5"
                      >
                        -{item.difference} {item.unit}
                      </Badge>
                    </TableCell>
                    {isManager && onEditItem && (
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            onEditItem({
                              code: item.code,
                              description: item.description,
                              minLevel: item.minLevel,
                            })
                          }
                          title="Editar cadastro do componente e estoque mínimo"
                        >
                          <Pencil className="size-3 mr-1" /> Editar
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

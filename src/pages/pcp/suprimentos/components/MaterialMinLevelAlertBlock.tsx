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
}

export function MaterialMinLevelAlertBlock({
  alerts,
  allMinLevels,
  isManager,
  onReload,
}: MaterialMinLevelAlertBlockProps) {
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [editDesc, setEditDesc] = useState<string>('')
  const [saving, setSaving] = useState(false)

  // Modal para cadastrar novo nível
  const [modalOpen, setModalOpen] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newMinLevel, setNewMinLevel] = useState('10')

  const { toast } = useToast()

  const handleStartEdit = (item: { code: string; description?: string; minLevel: number }) => {
    if (!isManager) return
    setEditingCode(item.code)
    setEditValue(String(item.minLevel))
    setEditDesc(item.description || '')
  }

  const handleSaveInline = async (code: string) => {
    const val = Number(editValue)
    if (isNaN(val) || val < 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um número maior ou igual a zero.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      await setMaterialMinLevel({
        code,
        description: editDesc,
        min_level: val,
      })
      toast({ title: 'Nível mínimo atualizado com sucesso!' })
      setEditingCode(null)
      onReload()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Falha ao atualizar nível mínimo.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCreateNew = async () => {
    if (!newCode.trim()) {
      toast({
        title: 'Campo obrigatório',
        description: 'Informe o código do componente.',
        variant: 'destructive',
      })
      return
    }
    const val = Number(newMinLevel)
    if (isNaN(val) || val < 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um número maior ou igual a zero.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      await setMaterialMinLevel({
        code: newCode.trim(),
        description: newDesc.trim(),
        min_level: val,
      })
      toast({ title: 'Nível mínimo cadastrado com sucesso!' })
      setModalOpen(false)
      setNewCode('')
      setNewDesc('')
      setNewMinLevel('10')
      onReload()
    } catch (err: any) {
      toast({
        title: 'Erro ao cadastrar',
        description: err.message || 'Falha ao salvar nível mínimo.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

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
            cadastrada. Apenas itens em situação de déficit aparecem aqui.
          </CardDescription>
        </div>

        {isManager && (
          <Button
            size="sm"
            onClick={() => setModalOpen(true)}
            className="h-8 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white gap-1"
          >
            <Plus className="size-3.5" /> Definir Nível Mínimo
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {allMinLevels.length === 0 ? (
          /* Estado Vazio: Nenhum nível cadastrado ainda */
          <div className="p-6 rounded-lg border border-dashed border-amber-300 dark:border-amber-800 bg-white/70 dark:bg-slate-900/60 text-center space-y-2">
            <Info className="size-8 mx-auto text-amber-600 dark:text-amber-400 opacity-80" />
            <h4 className="font-semibold text-sm text-foreground">
              Nenhum nível mínimo cadastrado ainda
            </h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Defina os limites mínimos dos componentes críticos clicando no botão &ldquo;Definir
              Nível Mínimo&rdquo; acima. O sistema alertará automaticamente quando o disponível
              (total − reservado) for menor que o limite.
            </p>
            {isManager && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModalOpen(true)}
                className="mt-2 text-xs font-semibold"
              >
                <Plus className="size-3.5 mr-1" /> Cadastrar primeiro nível mínimo
              </Button>
            )}
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
                  {isManager && (
                    <TableHead className="w-[90px] text-center font-bold text-amber-950 dark:text-amber-200">
                      Ação
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {alerts.map((item) => {
                  const isInlineEditing = editingCode === item.code
                  return (
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
                      <TableCell className="text-right">
                        {isInlineEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              min="0"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="h-7 w-20 text-xs text-right font-mono notranslate"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={saving}
                              onClick={() => handleSaveInline(item.code)}
                            >
                              <Check className="size-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 notranslate">
                            {item.minLevel} {item.unit}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="destructive"
                          className="font-mono font-bold text-[11px] px-2 py-0.5"
                        >
                          -{item.difference} {item.unit}
                        </Badge>
                      </TableCell>
                      {isManager && (
                        <TableCell className="text-center">
                          {!isInlineEditing && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleStartEdit(item)}
                              title="Editar nível mínimo deste componente"
                            >
                              <Pencil className="size-3 mr-1" /> Editar
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Modal para cadastrar novo nível */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="size-5 text-amber-600" />
              <span>Definir Nível Mínimo de Estoque</span>
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="space-y-1.5">
              <Label>Código do Material / Componente</Label>
              <Input
                placeholder="Ex: 05100033"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                className="font-mono notranslate"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input
                placeholder="Ex: Niple para lustre"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="notranslate"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nível Mínimo Desejado</Label>
              <Input
                type="number"
                min="0"
                placeholder="10"
                value={newMinLevel}
                onChange={(e) => setNewMinLevel(e.target.value)}
                className="font-mono notranslate"
              />
              <p className="text-[11px] text-muted-foreground">
                Um alerta visual será disparado no dashboard sempre que o estoque DISPONÍVEL (total
                − reservado) ficar abaixo deste valor.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleCreateNew}
              disabled={saving}
            >
              Salvar Nível Mínimo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

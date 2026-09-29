import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { ComponentCategory, MasterComponent } from '@/types'
import { createMasterComponent, checkDuplicateComponentCode } from '@/services/components'
import { Plus, Loader2, AlertCircle } from 'lucide-react'

interface CreateComponentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: ComponentCategory[]
  onCreated?: (component: MasterComponent) => void
}

export function CreateComponentDialog({
  open,
  onOpenChange,
  categories,
  onCreated,
}: CreateComponentDialogProps) {
  const { toast } = useToast()

  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('un')
  const [category, setCategory] = useState<string>('__NONE__')
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE')
  const [minQuantity, setMinQuantity] = useState('0')
  const [isSaving, setIsSaving] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)

  const resetForm = () => {
    setCode('')
    setDescription('')
    setUnit('un')
    setCategory('__NONE__')
    setStatus('ACTIVE')
    setMinQuantity('0')
    setDuplicateWarning(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  const handleCodeBlur = async () => {
    const trimmed = code.trim()
    if (!trimmed) {
      setDuplicateWarning(null)
      return
    }
    const check = await checkDuplicateComponentCode(trimmed)
    if (check.exists && check.existingComponent) {
      setDuplicateWarning(
        `Atenção: o código "${trimmed}" já está cadastrado no componente "${check.existingComponent.description}".`,
      )
    } else {
      setDuplicateWarning(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedCode = code.trim()
    const trimmedDesc = description.trim()
    const trimmedUnit = unit.trim() || 'un'
    const parsedMin = Math.max(0, Number(minQuantity) || 0)
    const selectedCat = category === '__NONE__' ? null : category

    if (!trimmedDesc) {
      toast({
        title: 'Descrição obrigatória',
        description: 'Informe a descrição do componente para salvar.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      // Validação de código duplicado antes de salvar
      if (trimmedCode) {
        const check = await checkDuplicateComponentCode(trimmedCode)
        if (check.exists && check.existingComponent) {
          toast({
            title: 'Código duplicado',
            description: `O código "${trimmedCode}" já está em uso pelo componente "${check.existingComponent.description}". Escolha outro código.`,
            variant: 'destructive',
          })
          setDuplicateWarning(`Código já cadastrado em: ${check.existingComponent.description}`)
          setIsSaving(false)
          return
        }
      }

      const newComp = await createMasterComponent({
        code: trimmedCode,
        description: trimmedDesc,
        unit: trimmedUnit,
        category: selectedCat,
        source: 'manual',
        active: status === 'ACTIVE',
        min_quantity: parsedMin,
      })

      toast({
        title: 'Componente cadastrado com sucesso',
        description: `O componente "${trimmedDesc}" foi adicionado ao Cadastro Mestre.`,
      })

      resetForm()
      onOpenChange(false)
      if (onCreated) onCreated(newComp)
    } catch (err: any) {
      toast({
        title: 'Erro ao cadastrar componente',
        description: err.message || 'Não foi possível cadastrar o novo componente.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const activeCategories = categories.filter((c) => c.active !== false)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
            <Plus className="size-4 text-blue-600" /> Novo Componente
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cadastre um novo componente no Cadastro Mestre do sistema. Ele ficará disponível para
            estoque, cotações, compras e composição técnica de produtos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Código do componente */}
          <div className="space-y-1.5">
            <Label htmlFor="new-comp-code" className="text-xs font-semibold">
              Código / SKU
            </Label>
            <Input
              id="new-comp-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                if (duplicateWarning) setDuplicateWarning(null)
              }}
              onBlur={handleCodeBlur}
              placeholder="Ex: 14040060"
              className="h-9 font-mono text-xs sm:text-sm notranslate"
              translate="no"
              disabled={isSaving}
            />
            {duplicateWarning && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded border border-amber-200 dark:border-amber-900">
                <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                <span>{duplicateWarning}</span>
              </div>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="new-comp-desc" className="text-xs font-semibold">
              Descrição <span className="text-red-500">*</span>
            </Label>
            <Input
              id="new-comp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: BUCHA EM NYLON Ø20X12,2MM - FIXAÇÃO ARANDELA NEBBIA"
              className="h-9 text-xs sm:text-sm notranslate"
              translate="no"
              disabled={isSaving}
              required
            />
          </div>

          {/* Categoria e Unidade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Categoria */}
            <div className="space-y-1.5">
              <Label htmlFor="new-comp-cat" className="text-xs font-semibold">
                Categoria
              </Label>
              <Select value={category} onValueChange={setCategory} disabled={isSaving}>
                <SelectTrigger id="new-comp-cat" className="h-9 text-xs">
                  <SelectValue placeholder="Selecione a categoria..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__" className="text-xs text-muted-foreground">
                    Sem categoria
                  </SelectItem>
                  {activeCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} className="text-xs">
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unidade */}
            <div className="space-y-1.5">
              <Label htmlFor="new-comp-unit" className="text-xs font-semibold">
                Unidade
              </Label>
              <Input
                id="new-comp-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Ex: un, pc, m, kg..."
                className="h-9 text-xs sm:text-sm uppercase notranslate"
                translate="no"
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Situação e Estoque Mínimo Desejado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Situação (Ativo / Inativo) */}
            <div className="space-y-1.5">
              <Label htmlFor="new-comp-status" className="text-xs font-semibold">
                Situação
              </Label>
              <Select
                value={status}
                onValueChange={(val: 'ACTIVE' | 'INACTIVE') => setStatus(val)}
                disabled={isSaving}
              >
                <SelectTrigger id="new-comp-status" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE" className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-500 inline-block" />
                      Ativo
                    </span>
                  </SelectItem>
                  <SelectItem value="INACTIVE" className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-slate-400 inline-block" />
                      Inativo
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Estoque Mínimo Inicial */}
            <div className="space-y-1.5">
              <Label htmlFor="new-comp-min" className="text-xs font-semibold">
                Estoque Mínimo Desejado
              </Label>
              <Input
                id="new-comp-min"
                type="number"
                min="0"
                step="any"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                placeholder="0"
                className="h-9 text-xs sm:text-sm font-mono notranslate"
                translate="no"
                disabled={isSaving}
              />
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Plus className="size-3.5" /> Salvar Componente
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

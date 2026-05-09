import { Product } from '@/types'
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
import { FileUp, Plus, Trash2, Download, FilePlus, FileText } from 'lucide-react'
import { Fragment, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'

const STAGES = ['FABRICAÇÃO', 'PREPARAÇÃO', 'MONTAGEM', 'EXPEDIÇÃO']

export function TabComposition({
  product,
  setProduct,
}: {
  product: Product
  setProduct: (p: Product) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const downloadTemplate = () => {
    const csvContent =
      '#;Etapa;Cód.;Descrição;Qtd.;Medida\n1;FABRICAÇÃO;COMP-001;Parafuso 10mm;100;10mm\n2;MONTAGEM;COMP-002;Porca 10mm;100;10mm'
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'modelo_composicao.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result
      if (typeof result !== 'string') return
      const text = result.replace(/^\uFEFF/, '')
      const lines = text.split(/\r?\n/)
      const newItems = []
      const delimiter = lines[0]?.includes(';') ? ';' : ','
      const headerCols = lines[0]?.split(delimiter).map((c) => c.trim().toLowerCase()) || []

      const hasIndexCol = headerCols.some(
        (c) => c === '#' || c === 'nº' || c === 'index' || c === 'id' || c === 'item',
      )
      const hasCode = headerCols.some((c) => c.includes('cód') || c.includes('cod'))
      const hasDesc = headerCols.some((c) => c.includes('descri'))
      const hasQtd = headerCols.some((c) => c.includes('qtd') || c.includes('quant'))
      const hasMedida = headerCols.some((c) => c.includes('medida'))

      if (!hasIndexCol || !hasCode || !hasDesc || !hasQtd || !hasMedida) {
        toast({
          title: 'Erro na importação',
          description:
            'A planilha não contém as colunas obrigatórias (#, Cód., Descrição, Qtd., Medida).',
          variant: 'destructive',
        })
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      let indexIdx = headerCols.findIndex(
        (c) => c === '#' || c === 'nº' || c === 'index' || c === 'id' || c === 'item',
      )
      let codeIdx = headerCols.findIndex((c) => c.includes('cód') || c.includes('cod'))
      let descIdx = headerCols.findIndex((c) => c.includes('descri'))
      let qtdIdx = headerCols.findIndex((c) => c.includes('qtd') || c.includes('quant'))
      let medIdx = headerCols.findIndex((c) => c.includes('medida'))
      let etapaIdx = headerCols.findIndex((c) => c.includes('etapa'))

      const isHeaderRow = headerCols.some(
        (c) =>
          c.includes('cód') ||
          c.includes('descri') ||
          c.includes('qtd') ||
          c.includes('medida') ||
          c === '#',
      )
      const startIdx = isHeaderRow ? 1 : 0

      for (let i = startIdx; i < lines.length; i++) {
        if (!lines[i].trim()) continue

        const rowStr = lines[i]
        const cols = []
        let current = ''
        let inQuotes = false
        for (let j = 0; j < rowStr.length; j++) {
          const char = rowStr[j]
          if (char === '"') {
            inQuotes = !inQuotes
          } else if (char === delimiter && !inQuotes) {
            cols.push(current)
            current = ''
          } else {
            current += char
          }
        }
        cols.push(current)

        if (cols.length >= 2) {
          newItems.push({
            id: Date.now().toString() + i,
            index: indexIdx !== -1 ? cols[indexIdx]?.trim().replace(/^"|"$/g, '') || '' : '',
            code: codeIdx !== -1 ? cols[codeIdx]?.trim().replace(/^"|"$/g, '') || '' : '',
            description: descIdx !== -1 ? cols[descIdx]?.trim().replace(/^"|"$/g, '') || '' : '',
            quantity: qtdIdx !== -1 ? cols[qtdIdx]?.trim().replace(/^"|"$/g, '') || '1' : '1',
            measurements: medIdx !== -1 ? cols[medIdx]?.trim().replace(/^"|"$/g, '') || '' : '',
            etapa:
              etapaIdx !== -1 ? cols[etapaIdx]?.trim().replace(/^"|"$/g, '')?.toUpperCase() : '',
          })
        }
      }
      setProduct({
        ...product,
        data: { ...product.data, composition: [...(product.data?.composition || []), ...newItems] },
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsText(file)
  }

  const addItem = (stage?: string) => {
    const newItem = {
      id: Date.now().toString(),
      index: '',
      code: '',
      description: '',
      quantity: '1',
      measurements: '',
      etapa: stage || '',
    }
    setProduct({
      ...product,
      data: { ...product.data, composition: [...(product.data?.composition || []), newItem] },
    })
  }

  const updateItem = (id: string, field: string, value: string | number) => {
    const newComp = (product.data?.composition || []).map((c) =>
      c.id === id ? { ...c, [field]: value } : c,
    )
    setProduct({ ...product, data: { ...product.data, composition: newComp } })
  }

  const removeItem = (id: string) => {
    setProduct({
      ...product,
      data: {
        ...product.data,
        composition: (product.data?.composition || []).filter((c) => c.id !== id),
      },
    })
  }

  const compFileInputRef = useRef<HTMLInputElement>(null)

  const handleCompFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const allowed = Array.from(e.target.files)
      setProduct({
        ...product,
        composition_files: [...(product.composition_files || []), ...allowed],
      })
    }
  }

  const handleCompDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files) {
      setProduct({
        ...product,
        composition_files: [
          ...(product.composition_files || []),
          ...Array.from(e.dataTransfer.files),
        ],
      })
    }
  }

  const composition = product.data?.composition || []

  const STAGE_GROUPS = [
    {
      name: 'FABRICAÇÃO',
      STAGE_KEY: 'FABRICAÇÃO',
      colorClass: 'bg-blue-100 hover:bg-blue-100/80 text-blue-900',
    },
    {
      name: 'PREPARAÇÃO',
      STAGE_KEY: 'PREPARAÇÃO',
      colorClass: 'bg-yellow-100 hover:bg-yellow-100/80 text-yellow-900',
    },
    {
      name: 'MONTAGEM',
      STAGE_KEY: 'MONTAGEM',
      colorClass: 'bg-green-100 hover:bg-green-100/80 text-green-900',
    },
    {
      name: 'EXPEDIÇÃO',
      STAGE_KEY: 'EXPEDIÇÃO',
      colorClass: 'bg-purple-100 hover:bg-purple-100/80 text-purple-900',
    },
    { name: 'SEM ETAPA', STAGE_KEY: '', colorClass: 'bg-muted/50 hover:bg-muted/50' },
  ]

  const groupedComposition = STAGE_GROUPS.map((group) => {
    let items
    if (group.STAGE_KEY === '') {
      items = composition.filter((c) => !c.etapa || !STAGES.includes(c.etapa.toUpperCase()))
    } else {
      items = composition.filter((c) => c.etapa?.toUpperCase() === group.STAGE_KEY)
    }
    return { ...group, items }
  }).filter((group) => group.items.length > 0 || group.STAGE_KEY === '')

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="text-lg font-medium">Lista de Componentes</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" /> Download Modelo
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <FileUp className="mr-2 h-4 w-4" /> Importar Planilha
            </Button>
            <input
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImport}
            />
            <Button onClick={() => addItem()}>
              <Plus className="mr-2 h-4 w-4" /> Novo Item
            </Button>
          </div>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Etapa</TableHead>
                <TableHead className="w-[80px]">#</TableHead>
                <TableHead className="w-[120px]">Cód.</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-[100px]">Qtd.</TableHead>
                <TableHead className="w-[150px]">Medida</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {composition.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum componente adicionado.
                  </TableCell>
                </TableRow>
              ) : (
                groupedComposition.map((group) => {
                  if (group.items.length === 0) return null
                  return (
                    <Fragment key={group.name}>
                      <TableRow className={group.colorClass}>
                        <TableCell colSpan={7} className="font-semibold text-xs tracking-wider">
                          {group.name}
                        </TableCell>
                      </TableRow>
                      {group.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <select
                              value={item.etapa?.toUpperCase() || ''}
                              onChange={(e) => updateItem(item.id, 'etapa', e.target.value)}
                              className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <option value="">Sem Etapa</option>
                              {STAGES.map((stage) => (
                                <option key={stage} value={stage}>
                                  {stage}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.index || ''}
                              onChange={(e) => updateItem(item.id, 'index', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.code}
                              onChange={(e) => updateItem(item.id, 'code', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.description}
                              onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="text"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.measurements}
                              onChange={(e) => updateItem(item.id, 'measurements', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(item.id)}
                              className="text-destructive h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium">Arquivos Técnicos e de Composição</h3>
        <p className="text-sm text-muted-foreground">
          Anexe planilhas, PDFs e documentos de composição nesta área.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <div
            className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center h-[120px] hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => compFileInputRef.current?.click()}
            onDrop={handleCompDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <input
              type="file"
              className="hidden"
              ref={compFileInputRef}
              multiple
              accept=".pdf,.xlsx,.xls,.doc,.docx,.csv"
              onChange={handleCompFileChange}
            />
            <FilePlus className="h-6 w-6 text-muted-foreground mb-1" />
            <span className="text-sm font-medium">Anexar</span>
          </div>

          {(product.composition_files || []).map((file: any, idx: number) => {
            const isFileObj = file instanceof File
            const fileName = isFileObj ? file.name : file
            const fileUrl = isFileObj ? undefined : pb.files.getUrl(product as any, file)

            return (
              <div
                key={idx}
                className="border border-border rounded-lg p-3 flex flex-col justify-between h-[120px] bg-muted/10 relative group"
              >
                <div className="flex flex-col items-start gap-2 overflow-hidden w-full">
                  <FileText className="h-6 w-6 text-primary shrink-0" />
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground font-medium truncate w-full hover:underline"
                    title={fileName}
                  >
                    {fileName}
                  </a>
                </div>
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    className="bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground p-1.5 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      const newFiles = [...(product.composition_files || [])]
                      newFiles.splice(idx, 1)
                      setProduct({ ...product, composition_files: newFiles })
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                  {isFileObj && (
                    <span className="text-[10px] font-medium bg-primary/90 text-primary-foreground px-1.5 py-0.5 rounded">
                      Novo
                    </span>
                  )}
                  <span className="text-[10px] font-medium bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded border border-border uppercase">
                    {fileName.split('.').pop()?.substring(0, 4) || '?'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

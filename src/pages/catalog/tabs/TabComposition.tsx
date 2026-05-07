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
import { FileUp, Plus, Trash2, Download } from 'lucide-react'
import { useRef } from 'react'

export function TabComposition({
  product,
  setProduct,
}: {
  product: Product
  setProduct: (p: Product) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = () => {
    const csvContent =
      'Codigo,Descricao,Quantidade,Medidas\nCOMP-001,Parafuso 10mm,100,10mm x 5mm\nCOMP-002,Porca 10mm,100,10mm'
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
      const text = event.target?.result as string
      const lines = text.split('\n')
      const newItems = []
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue
        const cols = lines[i].split(',')
        if (cols.length >= 4) {
          newItems.push({
            id: Date.now().toString() + i,
            code: cols[0]?.trim() || '',
            description: cols[1]?.trim() || '',
            quantity: parseInt(cols[2]?.trim()) || 1,
            measurements: cols[3]?.trim() || '',
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

  const addItem = () => {
    const newItem = {
      id: Date.now().toString(),
      code: '',
      description: '',
      quantity: 1,
      measurements: '',
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

  return (
    <div className="space-y-6 animate-fade-in">
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
          <Button onClick={addItem}>
            <Plus className="mr-2 h-4 w-4" /> Novo Item
          </Button>
        </div>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead className="w-[120px]">Cód.</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-[100px]">Qtd.</TableHead>
              <TableHead className="w-[150px]">Medidas</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(product.data?.composition?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum componente adicionado.
                </TableCell>
              </TableRow>
            ) : (
              product.data?.composition?.map((item, idx) => (
                <TableRow key={item.id}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>
                    <Input
                      value={item.code}
                      onChange={(e) => updateItem(item.id, 'code', e.target.value)}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value))}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.measurements}
                      onChange={(e) => updateItem(item.id, 'measurements', e.target.value)}
                      className="h-8"
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

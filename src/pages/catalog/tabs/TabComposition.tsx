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
import { FileUp, Plus, Trash2 } from 'lucide-react'

export function TabComposition({
  product,
  setProduct,
}: {
  product: Product
  setProduct: (p: Product) => void
}) {
  const addItem = () => {
    const newItem = {
      id: Date.now().toString(),
      code: '',
      description: '',
      quantity: 1,
      measurements: '',
    }
    setProduct({ ...product, composition: [...(product.composition || []), newItem] })
  }

  const updateItem = (id: string, field: string, value: string | number) => {
    const newComp = (product.composition || []).map((c) =>
      c.id === id ? { ...c, [field]: value } : c,
    )
    setProduct({ ...product, composition: newComp })
  }

  const removeItem = (id: string) => {
    setProduct({ ...product, composition: (product.composition || []).filter((c) => c.id !== id) })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Lista de Componentes</h3>
        <div className="flex gap-2">
          <Button variant="outline">
            <FileUp className="mr-2 h-4 w-4" /> Importar Planilha
          </Button>
          <Button onClick={addItem}>
            <Plus className="mr-2 h-4 w-4" /> Novo Item
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
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
            {(product.composition?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum componente adicionado.
                </TableCell>
              </TableRow>
            ) : (
              product.composition?.map((item, idx) => (
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

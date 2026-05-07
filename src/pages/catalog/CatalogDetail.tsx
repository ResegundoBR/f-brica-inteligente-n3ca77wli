import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Save } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useApp } from '@/contexts/app-context'
import { Product } from '@/types'
import { TabGeneral } from './tabs/TabGeneral'
import { TabEngineering } from './tabs/TabEngineering'
import { TabProcesses } from './tabs/TabProcesses'
import { TabComposition } from './tabs/TabComposition'
import { TabChecklist } from './tabs/TabChecklist'
import { TabReview } from './tabs/TabReview'
import { ArrowLeftIcon, SaveIcon } from 'lucide-react'

export default function CatalogDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { products, updateProduct } = useApp()
  const [product, setProduct] = useState<Product | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [activeTab, setActiveTab] = useState('geral')

  useEffect(() => {
    if (id === 'novo') {
      setProduct({
        id: `P00${products.length + 1}`,
        name: '',
        details: '',
        status: 'Iniciado',
        lastUpdate: new Date().toISOString().split('T')[0],
        daysIdle: 0,
        processes: [],
        composition: [],
        checklist: [],
        reviewPoints: [],
      })
    } else {
      const found = products.find((p) => p.id === id)
      if (found) {
        setProduct({ ...found }) // clone to edit
        if (found.status === 'Pendência') setActiveTab('revisao')
      }
    }
  }, [id, products])

  const handleSaveClick = () => {
    setShowSaveDialog(true)
  }

  const performSave = (action: 'draft' | 'review') => {
    if (!product) return
    const finalProduct = {
      ...product,
      status: action === 'review' ? ('Revisão' as const) : product.status,
    }
    updateProduct(finalProduct)
    setShowSaveDialog(false)
    navigate('/catalogo')
  }

  if (!product) return <div>Carregando...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/catalogo')}>
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {id === 'novo' ? 'Novo Produto' : product.name || 'Sem Título'}
            </h1>
            <p className="text-sm text-muted-foreground text-mono">ID: {product.id}</p>
          </div>
        </div>
        <Button onClick={handleSaveClick}>
          <SaveIcon className="mr-2 h-4 w-4" /> Salvar Cadastro
        </Button>
      </div>

      <Card className="p-1">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0 h-auto">
            <TabsTrigger
              value="geral"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 px-6"
            >
              Geral
            </TabsTrigger>
            <TabsTrigger
              value="engenharia"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 px-6"
            >
              Engenharia
            </TabsTrigger>
            <TabsTrigger
              value="processos"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 px-6"
            >
              Processos
            </TabsTrigger>
            <TabsTrigger
              value="composicao"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 px-6"
            >
              Composição
            </TabsTrigger>
            <TabsTrigger
              value="checklist"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 px-6"
            >
              Checklist
            </TabsTrigger>
            <TabsTrigger
              value="revisao"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 px-6"
            >
              Revisão{' '}
              {product.reviewPoints.length > 0 && (
                <span className="ml-2 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                  {product.reviewPoints.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="p-6">
            <TabsContent value="geral" className="m-0">
              <TabGeneral product={product} setProduct={setProduct} />
            </TabsContent>
            <TabsContent value="engenharia" className="m-0">
              <TabEngineering />
            </TabsContent>
            <TabsContent value="processos" className="m-0">
              <TabProcesses product={product} setProduct={setProduct} />
            </TabsContent>
            <TabsContent value="composicao" className="m-0">
              <TabComposition product={product} setProduct={setProduct} />
            </TabsContent>
            <TabsContent value="checklist" className="m-0">
              <TabChecklist product={product} setProduct={setProduct} />
            </TabsContent>
            <TabsContent value="revisao" className="m-0">
              <TabReview product={product} setProduct={setProduct} />
            </TabsContent>
          </div>
        </Tabs>
      </Card>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar Cadastro</DialogTitle>
            <DialogDescription>Como deseja prosseguir com este registro?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button
              variant="default"
              className="w-full justify-start"
              size="lg"
              onClick={() => performSave('review')}
            >
              <Send className="mr-2 h-5 w-5" /> Enviar para Revisão
              <span className="ml-auto text-xs opacity-70">Notifica o revisador</span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              size="lg"
              onClick={() => performSave('draft')}
            >
              <SaveIcon className="mr-2 h-5 w-5" /> Manter como Rascunho
              <span className="ml-auto text-xs opacity-70">Salva e mantém em Andamento</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Product, ProductStatusModel } from '@/types'
import pb from '@/lib/pocketbase/client'
import { TabGeneral } from './tabs/TabGeneral'
import { TabEngineering } from './tabs/TabEngineering'
import { TabProcesses } from './tabs/TabProcesses'
import { TabComposition } from './tabs/TabComposition'
import { TabChecklist } from './tabs/TabChecklist'
import { TabReview } from './tabs/TabReview'
import { TabHistory } from './tabs/TabHistory'
import { ArrowLeftIcon, SaveIcon, SendIcon, CheckCircle } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'

export default function CatalogDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()
  const [product, setProduct] = useState<Product | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [activeTab, setActiveTab] = useState('geral')
  const [statuses, setStatuses] = useState<ProductStatusModel[]>([])
  const [pendingProcesses, setPendingProcesses] = useState<any[]>([])
  const [isAssemblyPhaseUnlocked, setIsAssemblyPhaseUnlocked] = useState(false)

  useEffect(() => {
    let defaultStatus = ''
    pb.collection('product_statuses')
      .getFullList<ProductStatusModel>()
      .then((list) => {
        setStatuses(list)
        const iniciado = list.find((s) => s.name.toLowerCase() === 'iniciado')
        if (iniciado) {
          defaultStatus = iniciado.id
          if (id === 'novo') {
            setProduct((p) => (p ? { ...p, status: defaultStatus } : p))
          }
        }
      })
      .catch(console.error)

    if (id === 'novo') {
      setProduct({
        id: '',
        code: '',
        name: '',
        description: '',
        status: defaultStatus,
        owner: user?.id || '',
        data: {
          processes: [],
          composition: [],
          checklist: [],
          reviewPoints: [],
        },
        files: [],
        engineering_files: [],
        composition_files: [],
        created: '',
        updated: '',
      } as any)
    } else if (id) {
      pb.collection('products')
        .getOne<Product>(id, { expand: 'status,owner' })
        .then((found) => {
          const statusName = found.expand?.status?.name?.toLowerCase() || ''
          const rName = user?.expand?.role?.name?.toLowerCase() || ''
          const isUserHighLevel =
            rName.includes('admin') || rName.includes('revis') || rName.includes('administrador')

          setIsAssemblyPhaseUnlocked(statusName === 'validado')

          if (statusName === 'validado' && !isUserHighLevel) {
            toast({
              title: 'Acesso Negado',
              description: 'Você não tem permissão para editar um produto validado.',
              variant: 'destructive',
            })
            navigate('/catalogo')
            return
          }

          setProduct({
            ...found,
            data: found.data || {},
          })
          if (statusName.includes('pendencia') || statusName.includes('pendência'))
            setActiveTab('revisao')
        })
        .catch(console.error)
    }
  }, [id, user, navigate, toast])

  const roleName = user?.expand?.role?.name?.toLowerCase() || ''
  const isHighLevel =
    roleName.includes('admin') || roleName.includes('revis') || roleName.includes('administrador')

  const handleSaveClick = () => {
    setShowSaveDialog(true)
  }

  const performSave = async (action: 'draft' | 'review' | 'validate') => {
    if (!product) return

    if (!product.code?.trim() || !product.name?.trim()) {
      toast({ title: 'Código e Nome do Produto são obrigatórios', variant: 'destructive' })
      setShowSaveDialog(false)
      return
    }

    try {
      let targetStatus = product.status
      if (action === 'review') {
        const revStatus = statuses.find(
          (s) => s.name.toLowerCase() === 'revisao' || s.name.toLowerCase() === 'revisão',
        )
        if (revStatus) targetStatus = revStatus.id
      } else if (action === 'validate') {
        const valStatus = statuses.find((s) => s.name.toLowerCase() === 'validado')
        if (valStatus) targetStatus = valStatus.id
      } else if (id === 'novo' && !targetStatus) {
        const iniciado = statuses.find((s) => s.name.toLowerCase() === 'iniciado')
        if (iniciado) targetStatus = iniciado.id
      }

      const dataToSave: any = {
        code: product.code,
        name: product.name,
        description: product.description,
        status: targetStatus,
        owner: product.owner || user?.id || '',
        data: {
          processes: product.data?.processes || [],
          composition: product.data?.composition || [],
          checklist: product.data?.checklist || [],
          reviewPoints: product.data?.reviewPoints || [],
        },
      }

      if (product.files && product.files.length > 0) {
        dataToSave.files = product.files
      } else {
        dataToSave.files = null
      }

      if (product.engineering_files && product.engineering_files.length > 0) {
        dataToSave.engineering_files = product.engineering_files
      } else {
        dataToSave.engineering_files = null
      }

      if (product.composition_files && product.composition_files.length > 0) {
        dataToSave.composition_files = product.composition_files
      } else {
        dataToSave.composition_files = null
      }

      if (id === 'novo') {
        const createdProduct = await pb.collection('products').create(dataToSave)

        if (product.data?.checklist && product.data.checklist.length > 0) {
          for (const desc of product.data.checklist) {
            await pb.collection('revision_points').create({
              product_id: createdProduct.id,
              user_id: user?.id || createdProduct.owner,
              description: desc,
              resolved: false,
            })
          }
        }

        if (pendingProcesses.length > 0) {
          for (const proc of pendingProcesses) {
            const formData = new FormData()
            formData.append('product_id', createdProduct.id)
            formData.append('name', proc.name)
            formData.append('description', proc.description || '')
            formData.append('order', proc.order.toString())
            if (proc.imageFile) {
              formData.append('image', proc.imageFile)
            }
            await pb.collection('product_processes').create(formData)
          }
        }
      } else {
        await pb.collection('products').update(product.id, dataToSave)
      }

      if (action === 'validate') {
        toast({
          title: 'Produto validado com sucesso!',
          description: 'O cadastro foi finalizado e bloqueado para edições.',
          className: 'bg-green-600 text-white border-green-700',
        })
      } else {
        toast({ title: 'Produto salvo com sucesso!' })
      }

      setShowSaveDialog(false)
      navigate('/catalogo')
    } catch (err) {
      toast({ title: 'Erro ao salvar', variant: 'destructive' })
      console.error(err)
    }
  }

  if (!product) return <div>Carregando...</div>

  return (
    <div className="space-y-6" data-assembly-unlocked={isAssemblyPhaseUnlocked}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/catalogo')}>
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {id === 'novo' ? 'Novo Produto' : product.name || 'Sem Título'}
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              Código: {product.code || 'N/A'} • ID: {product.id || 'Não salvo'}
            </p>
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
              {(product.data?.reviewPoints?.length || 0) > 0 && (
                <span className="ml-2 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                  {product.data?.reviewPoints?.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="historico"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 px-6"
            >
              Histórico
            </TabsTrigger>
          </TabsList>

          <div className="p-6">
            <TabsContent value="geral" className="m-0">
              <TabGeneral product={product} setProduct={setProduct} />
            </TabsContent>
            <TabsContent value="engenharia" className="m-0">
              <TabEngineering product={product} setProduct={setProduct} />
            </TabsContent>
            <TabsContent value="processos" className="m-0">
              <TabProcesses
                product={product}
                setProduct={setProduct}
                pendingProcesses={pendingProcesses}
                setPendingProcesses={setPendingProcesses}
              />
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
            <TabsContent value="historico" className="m-0">
              <TabHistory product={product} />
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
              <SendIcon className="mr-2 h-5 w-5" /> Enviar para Revisão
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
            {isHighLevel && (
              <Button
                variant="default"
                className="w-full justify-start bg-green-600 hover:bg-green-700 text-white"
                size="lg"
                onClick={() => performSave('validate')}
              >
                <CheckCircle className="mr-2 h-5 w-5" /> Validar Cadastro
                <span className="ml-auto text-xs opacity-70">
                  Finaliza o registro e define como Validado
                </span>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ShieldAlert } from 'lucide-react'

export default function AdminRoles() {
  return (
    <div className="space-y-6 animate-fade-in-up max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Funções e Acessos</h1>
        <p className="text-muted-foreground">
          Configure as permissões granulares para cada perfil.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Editar Perfil: Registrador</CardTitle>
            <Button variant="outline" size="sm">
              Selecionar outro perfil
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="font-semibold text-lg flex items-center">
              <ShieldAlert className="h-5 w-5 mr-2 text-primary" /> Módulo Catálogo Técnico
            </h3>
            <div className="grid gap-2 pl-7">
              <div className="flex items-center space-x-2">
                <Checkbox id="c1" defaultChecked />
                <Label htmlFor="c1">Visualizar Lista de Produtos</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="c2" defaultChecked />
                <Label htmlFor="c2">Criar Novos Cadastros</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="c3" defaultChecked />
                <Label htmlFor="c3">Responder Pontos de Revisão</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="c4" />
                <Label htmlFor="c4" className="text-muted-foreground">
                  Validar Produtos (Apenas Revisador)
                </Label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-lg flex items-center">
              <ShieldAlert className="h-5 w-5 mr-2 text-primary" /> Módulo Aprendizado
            </h3>
            <div className="grid gap-2 pl-7">
              <div className="flex items-center space-x-2">
                <Checkbox id="l1" defaultChecked />
                <Label htmlFor="l1">Inserir Registros de Aprendizado</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="l2" />
                <Label htmlFor="l2" className="text-muted-foreground">
                  Validar Aprendizados de Terceiros
                </Label>
              </div>
            </div>
          </div>

          <Button className="mt-4">Salvar Permissões</Button>
        </CardContent>
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/contexts/app-context'
import { Plus, UploadCloud, CheckCircle2, Calendar } from 'lucide-react'

export default function Learning() {
  const { learningRecords, currentUser } = useApp()
  const [showForm, setShowForm] = useState(false)
  const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'Revisador'

  return (
    <div className="space-y-8 animate-fade-in-up max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Evolução do Aprendizado</h1>
          <p className="text-muted-foreground">
            Registre e acompanhe novas habilidades adquiridas.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" /> Novo Registro
        </Button>
      </div>

      {showForm && (
        <Card className="animate-slide-down border-primary/50 shadow-md">
          <CardHeader>
            <CardTitle className="text-xl">O que você aprendeu?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="space-y-2">
                <Label>Atividade / Produto</Label>
                <Input placeholder="Ex: Operação de Calandra" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>O que foi aprendido (passo a passo)</Label>
              <Textarea
                placeholder="Descreva os processos realizados..."
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Evidências (Fotos)</Label>
              <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50">
                <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm">Clique ou arraste fotos do processo e produto final</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setShowForm(false)}>Salvar Registro</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative border-l-2 border-muted ml-4 md:ml-6 space-y-8 pb-8">
        {learningRecords.map((record) => (
          <div key={record.id} className="relative pl-8 md:pl-10">
            <div className="absolute -left-[11px] top-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center ring-4 ring-background">
              <div className="h-2 w-2 rounded-full bg-primary-foreground" />
            </div>
            <Card>
              <CardContent className="p-0 flex flex-col md:flex-row">
                <div className="p-4 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-lg">{record.title}</h3>
                    {record.validated ? (
                      <Badge className="bg-emerald-600">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Validado
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Pendente Validação</Badge>
                    )}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Calendar className="mr-2 h-4 w-4" /> {record.date}
                  </div>
                  <p className="text-sm">{record.description}</p>

                  {!record.validated && isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 text-emerald-600 border-emerald-200"
                    >
                      Validar Aprendizado
                    </Button>
                  )}
                </div>
                {record.photos.length > 0 && (
                  <div className="w-full md:w-48 h-48 md:h-auto bg-muted">
                    <img
                      src={record.photos[0]}
                      alt="Evidência"
                      className="w-full h-full object-cover rounded-b-lg md:rounded-r-lg md:rounded-bl-none"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}

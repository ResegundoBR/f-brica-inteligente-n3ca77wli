import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export default function ChangePassword() {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!password || !passwordConfirm) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Cannot be blank.' })
      return
    }

    if (password !== passwordConfirm) {
      toast({ variant: 'destructive', title: 'Erro', description: 'As senhas não coincidem.' })
      return
    }

    if (password.length < 8) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'A senha deve ter no mínimo 8 caracteres.',
      })
      return
    }

    setLoading(true)
    try {
      if (user) {
        const updatedRecord = await pb.collection('users').update(user.id, {
          password,
          passwordConfirm,
          must_change_password: false,
        })

        // Update the auth store to sync context state and ensure AuthGuard allows access to dashboard
        pb.authStore.save(pb.authStore.token, updatedRecord)

        toast({ title: 'Sucesso', description: 'Senha alterada com sucesso.' })
        navigate('/')
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  // Ensure unauthenticated users cannot access this page
  if (!user && !loading) {
    navigate('/login')
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-[440px] shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold">Atualização de Senha</CardTitle>
          <CardDescription className="text-sm mt-1.5 text-slate-500">
            Este é o seu primeiro acesso. Por favor, crie uma nova senha para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-900">
                Nova Senha
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passwordConfirm" className="text-sm font-medium text-slate-900">
                Confirmar Nova Senha
              </Label>
              <Input
                id="passwordConfirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="h-10"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#243e9e] hover:bg-[#1c307b] text-white transition-colors h-10 mt-2"
              disabled={loading}
            >
              {loading ? 'Salvando...' : 'Salvar e Continuar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

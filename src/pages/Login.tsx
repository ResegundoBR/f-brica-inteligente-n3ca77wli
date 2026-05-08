import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import { Factory } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setFormError('')
    try {
      const authData = await pb.collection('users').authWithPassword(email, password)

      if (!authData.record.active) {
        pb.authStore.clear()
        toast({
          variant: 'destructive',
          title: 'Acesso Negado',
          description: 'Sua conta está inativa. Entre em contato com o administrador.',
        })
        return
      }

      if (authData.record.must_change_password) {
        navigate('/change-password')
      } else {
        navigate('/')
      }
    } catch (err: any) {
      const fErrors = extractFieldErrors(err)
      const defaultMsg = getErrorMessage(err)

      let errorMsg = defaultMsg

      if (Object.keys(fErrors).length > 0) {
        errorMsg = Object.values(fErrors).join(', ')
      } else if (err.status === 400 && defaultMsg === 'Failed to authenticate.') {
        errorMsg = 'Usuário não encontrado ou senha incorreta.'
      }

      setFormError(errorMsg)

      toast({
        variant: 'destructive',
        title: 'Erro ao fazer login',
        description: errorMsg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="text-center bg-slate-900 pb-8 pt-8">
          <div className="mx-auto w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-white mb-4">
            <Factory className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl tracking-tight">
            <span className="text-green-600">Fábrica</span>{' '}
            <span className="text-orange-500">Inteligente</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setFormError('')
                }}
                required
                className={formError ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {formError && (
                <p className="text-sm font-bold text-destructive mt-1.5">{formError}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import { Factory, Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

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
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary rounded-lg flex items-center justify-center text-primary-foreground mb-4">
            <Factory className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Fábrica Inteligente</CardTitle>
          <CardDescription>Acesse sua conta para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6 bg-muted/50 text-left">
            <Info className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>
                Para seu primeiro acesso use o seu email e a senha inicial:{' '}
                <strong>Skip@Pass</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Link de acesso para novos membros:{' '}
                <a
                  href="https://analise-documental-4f8b1.goskip.app"
                  className="underline hover:text-foreground font-medium"
                >
                  https://analise-documental-4f8b1.goskip.app
                </a>
              </p>
            </AlertDescription>
          </Alert>
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

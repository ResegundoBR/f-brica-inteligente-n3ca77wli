import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { extractFieldErrors, getErrorMessage, type FieldErrors } from '@/lib/pocketbase/errors'
import { cn } from '@/lib/utils'

export default function ChangePassword() {
  const { user, setUser } = useAuth()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})

    const errors: FieldErrors = {}
    if (!password) errors.password = 'Cannot be blank.'
    if (!passwordConfirm) errors.passwordConfirm = 'Cannot be blank.'

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    if (password !== passwordConfirm) {
      setFieldErrors({ passwordConfirm: 'As senhas não coincidem.' })
      return
    }

    if (password.length < 8) {
      setFieldErrors({ password: 'A senha deve ter no mínimo 8 caracteres.' })
      return
    }

    setLoading(true)
    try {
      if (user) {
        const updatedRecord = await pb.send('/backend/v1/users/change-password', {
          method: 'POST',
          body: {
            id: user.id,
            password,
            passwordConfirm,
          },
        })

        // Update the auth store to sync context state and ensure AuthGuard allows access to dashboard
        pb.authStore.save(pb.authStore.token, updatedRecord)
        setUser(updatedRecord)

        toast({ title: 'Sucesso', description: 'Senha alterada com sucesso.' })
        navigate('/')
      }
    } catch (err: any) {
      const backendErrors = extractFieldErrors(err)
      if (Object.keys(backendErrors).length > 0) {
        setFieldErrors(backendErrors)
      } else {
        toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) })
      }
    } finally {
      setLoading(false)
    }
  }

  // Ensure unauthenticated users cannot access this page
  if (!user && !loading) {
    return <Navigate to="/login" replace />
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
              <Label
                htmlFor="password"
                className={cn(
                  'text-sm font-medium',
                  fieldErrors.password ? 'text-red-500' : 'text-slate-900',
                )}
              >
                Nova Senha
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }))
                }}
                className={cn(
                  'h-10',
                  fieldErrors.password && 'border-red-500 focus-visible:ring-red-500',
                )}
              />
              {fieldErrors.password && (
                <p className="text-sm text-red-500">{fieldErrors.password}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="passwordConfirm"
                className={cn(
                  'text-sm font-medium',
                  fieldErrors.passwordConfirm ? 'text-red-500' : 'text-slate-900',
                )}
              >
                Confirmar Nova Senha
              </Label>
              <Input
                id="passwordConfirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => {
                  setPasswordConfirm(e.target.value)
                  if (fieldErrors.passwordConfirm)
                    setFieldErrors((prev) => ({ ...prev, passwordConfirm: '' }))
                }}
                className={cn(
                  'h-10',
                  fieldErrors.passwordConfirm && 'border-red-500 focus-visible:ring-red-500',
                )}
              />
              {fieldErrors.passwordConfirm && (
                <p className="text-sm text-red-500">{fieldErrors.passwordConfirm}</p>
              )}
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

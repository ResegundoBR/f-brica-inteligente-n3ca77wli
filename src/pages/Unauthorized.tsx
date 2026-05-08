import { Button } from '@/components/ui/button'
import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Unauthorized() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 text-center animate-fade-in-up">
      <ShieldAlert className="h-16 w-16 text-destructive mb-6" />
      <h2 className="text-3xl font-bold mb-4 tracking-tight">Acesso Negado</h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        Você não tem permissão para acessar esta seção do sistema. Se você acha que isso é um erro,
        entre em contato com um administrador.
      </p>
      <Button asChild size="lg">
        <Link to="/">Voltar para o Início</Link>
      </Button>
    </div>
  )
}

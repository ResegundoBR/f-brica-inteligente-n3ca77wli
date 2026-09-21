import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, CheckCheck, ExternalLink, PackageCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import {
  AppNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/services/notifications'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function ManagerNotificationsBell({ className }: { className?: string }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [hasNew, setHasNew] = useState(false)

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return
    try {
      setLoading(true)
      const list = await getUserNotifications(25)
      setNotifications(list)
    } catch (err) {
      console.error('Erro ao carregar notificações:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  // Assinatura em tempo real para novas notificações
  useRealtime('notifications', (e) => {
    if (e.record.user_id === user?.id) {
      if (e.action === 'create') {
        setHasNew(true)
      }
      loadNotifications()
    }
  })

  const unreadCount = notifications.filter((n) => !n.read).length

  const handleMarkAsRead = async (notif: AppNotification) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id)
      setNotifications((prev) =>
        prev.map((item) => (item.id === notif.id ? { ...item, read: true } : item)),
      )
    }
    if (notif.action_url) {
      navigate(notif.action_url)
    }
  }

  const handleMarkAll = async () => {
    await markAllNotificationsAsRead()
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))
  }

  return (
    <>
      <style>{`
        @keyframes notif-bell-shake {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(-14deg); }
          30% { transform: rotate(14deg); }
          45% { transform: rotate(-10deg); }
          60% { transform: rotate(10deg); }
          75% { transform: rotate(-6deg); }
          90% { transform: rotate(6deg); }
        }
      `}</style>

      <Popover
        onOpenChange={(open) => {
          if (open) setHasNew(false)
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('relative h-9 w-9 text-foreground', className)}
            title={
              unreadCount > 0
                ? `${unreadCount} notificação(ões) do sistema`
                : 'Notificações do Sistema'
            }
          >
            <Bell
              className={cn(
                'h-5 w-5 transition-transform',
                unreadCount > 0 && 'text-emerald-600 dark:text-emerald-400',
              )}
              style={hasNew ? { animation: 'notif-bell-shake 0.6s ease-in-out' } : undefined}
            />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1 bg-emerald-600 shadow-sm animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-88 sm:w-96 p-0 shadow-lg">
          {/* Cabeçalho do painel */}
          <div className="px-4 py-3 font-medium border-b flex items-center justify-between bg-muted/40">
            <div className="flex items-center gap-2">
              <PackageCheck className="size-4 text-emerald-600" />
              <span className="font-semibold text-sm">Notificações do Gestor</span>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground gap-1"
                onClick={handleMarkAll}
              >
                <CheckCheck className="size-3.5" />
                Marcar lidas
              </Button>
            )}
          </div>

          {/* Lista de notificações */}
          <div className="max-h-[360px] overflow-y-auto divide-y">
            {loading && notifications.length === 0 ? (
              <div className="p-6 text-sm text-center text-muted-foreground flex items-center justify-center gap-2">
                <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>Carregando notificações...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground space-y-1">
                <PackageCheck className="size-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="font-medium text-foreground">Tudo em dia!</p>
                <p className="text-xs">Nenhuma notificação no momento.</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isSeparação =
                  notif.message.toLowerCase().includes('separação') ||
                  notif.message.toLowerCase().includes('separacao') ||
                  notif.message.toLowerCase().includes('programação') ||
                  notif.message.toLowerCase().includes('programacao')

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleMarkAsRead(notif)}
                    className={cn(
                      'p-3 hover:bg-muted/60 cursor-pointer transition-colors flex items-start gap-3',
                      !notif.read ? 'bg-emerald-500/10 dark:bg-emerald-950/20' : '',
                    )}
                  >
                    <div
                      className={cn(
                        'p-2 rounded-lg shrink-0 mt-0.5',
                        isSeparação
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {isSeparação ? (
                        <PackageCheck className="size-4" />
                      ) : (
                        <Info className="size-4" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-xs text-foreground truncate">
                          {isSeparação ? 'Separação de Materiais' : 'Aviso do Sistema'}
                        </span>
                        {notif.created && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(notif.created), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-foreground/90 leading-snug break-words">
                        {notif.message}
                      </p>

                      <div className="flex items-center justify-between pt-0.5">
                        {notif.action_url && (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1 hover:underline">
                            <span>Ver programação</span>
                            <ExternalLink className="size-3" />
                          </span>
                        )}
                        {!notif.read && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 h-4 bg-emerald-600 text-white ml-auto"
                          >
                            Nova
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Rodapé do sino com link direto para a tela de Programação */}
          <div className="p-2 border-t bg-muted/20">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs justify-center gap-1.5 h-8 font-semibold"
              onClick={() => navigate('/pcp/programacao')}
            >
              <span>Ir para a tela de Programação</span>
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}

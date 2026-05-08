import { useState, useEffect } from 'react'
import { Bell, Search, UserCircle, CheckCircle, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/hooks/use-auth'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function Header() {
  const { user, signOut } = useAuth()
  const [notifications, setNotifications] = useState<any[]>([])

  const loadNotifications = async () => {
    if (!user) return
    try {
      const res = await pb.collection('notifications').getFullList({ sort: '-created' })
      setNotifications(res)
    } catch {
      /* intentionally ignored */
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [user])

  useRealtime('notifications', () => {
    loadNotifications()
  })

  const markAsRead = async (id: string) => {
    try {
      await pb.collection('notifications').update(id, { read: true })
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch {
      /* intentionally ignored */
    }
  }

  const deleteNotification = async (id: string) => {
    try {
      await pb.collection('notifications').delete(id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch {
      /* intentionally ignored */
    }
  }

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    reviewer: 'Revisador',
    registrator: 'Registrador',
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b bg-background px-4 md:px-6">
      <SidebarTrigger className="-ml-2" />
      <div className="flex-1 flex items-center gap-4 max-w-sm">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Pesquisar..."
            className="w-full bg-muted/50 pl-9 border-none focus-visible:ring-1"
          />
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {notifications.some((n) => !n.read) && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="px-4 py-3 font-medium border-b">Notificações</div>
            <div className="max-h-[300px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-sm text-center text-muted-foreground">
                  Nenhuma notificação não lida.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 border-b last:border-b-0 flex flex-col gap-2 hover:bg-muted/50 transition-colors ${n.read ? 'opacity-60' : 'bg-muted/20'}`}
                  >
                    <div className="flex justify-between gap-3">
                      <div className="flex-1 text-sm flex gap-2">
                        {!n.read && (
                          <span className="h-2 w-2 mt-1.5 rounded-full bg-blue-600 shrink-0" />
                        )}
                        <span
                          className={
                            n.read ? 'text-muted-foreground' : 'font-medium text-foreground'
                          }
                        >
                          {n.message}
                        </span>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {!n.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-emerald-600"
                            onClick={() => markAsRead(n.id)}
                            title="Marcar como lida"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteNotification(n.id)}
                          title="Excluir notificação"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {n.created
                        ? formatDistanceToNow(new Date(n.created), {
                            addSuffix: true,
                            locale: ptBR,
                          })
                        : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <UserCircle className="h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium">{user?.name}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {user?.role ? roleLabels[user.role] : ''}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={signOut}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

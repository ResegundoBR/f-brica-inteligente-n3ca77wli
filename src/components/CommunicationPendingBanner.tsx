import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import pb from '@/lib/pocketbase/client'
import type { PcpOrderMessage, MessageSector } from '@/types'
import {
  isPcpSender,
  isPcpManager,
  getUserChannel,
  getUserSector,
  SECTOR_OPTIONS,
  SECTOR_VISUALS,
} from '@/lib/message-sector'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, MessageSquare, ArrowRight, X, CheckCircle2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SectorBreakdown {
  sector: MessageSector
  count: number
}

const STORAGE_KEY_PREFIX = 'pcp_comm_banner_last_seen'

export function CommunicationPendingBanner() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const isPcp = isPcpManager(user)
  const detectedSector = getUserSector(user)
  const userChannel = getUserChannel(user) || (detectedSector !== 'pcp' ? detectedSector : null)

  const [messages, setMessages] = useState<PcpOrderMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  const storageKey = useMemo(() => {
    if (!user) return null
    return `${STORAGE_KEY_PREFIX}_${user.id}`
  }, [user])

  const getLastSeen = useCallback((): number => {
    if (!storageKey || typeof window === 'undefined') return 0
    const raw = window.localStorage.getItem(storageKey)
    return raw ? Number(raw) || 0 : 0
  }, [storageKey])

  const setLastSeen = useCallback(
    (timestamp: number) => {
      if (!storageKey || typeof window === 'undefined') return
      window.localStorage.setItem(storageKey, String(timestamp))
    },
    [storageKey],
  )

  const loadData = useCallback(async () => {
    if (!pb.authStore.isValid && !user) {
      setMessages([])
      setLoading(false)
      setError(null)
      return
    }
    setError(null)
    try {
      const records = await pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
        sort: '-created',
        expand: 'user_id.role,order_id.client_id',
      })
      setMessages(records)
    } catch (err: any) {
      console.error('Erro ao carregar mensagens para banner de comunicação', err)
      setError(err?.message || 'Falha ao sincronizar mensagens.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  useRealtime(
    'pcp_order_messages',
    () => {
      loadData()
    },
    {
      onReconnect: () => {
        loadData()
      },
    },
  )

  // Calcula pendências e novidades
  const summary = useMemo(() => {
    if (!user) {
      return {
        hasPendencies: false,
        totalItems: 0,
        pendingCount: 0,
        unreadCount: 0,
        pcpAnsweredCount: 0,
        sectorBreakdown: [] as SectorBreakdown[],
        latestCreatedTime: 0,
        firstPendingOrderId: null as string | null,
      }
    }

    let pendingCount = 0
    let unreadCount = 0
    let pcpAnsweredCount = 0
    let latestCreatedTime = 0
    let firstPendingOrderId: string | null = null

    const breakdownMap: Record<string, number> = {}

    if (isPcp) {
      // VISÃO DO PCP:
      // Vê perguntas pendentes por setor (feitas pelos setores) e mensagens não lidas de outros
      for (const msg of messages) {
        const time = new Date(msg.created).getTime()
        if (time > latestCreatedTime) latestCreatedTime = time

        const msgFromPcp = isPcpSender(msg)
        if (msgFromPcp || msg.user_id === user.id) continue

        // Perguntas pendentes
        if (msg.type === 'Pergunta' && msg.status === 'Pendente') {
          pendingCount += 1
          if (!firstPendingOrderId && msg.order_id) {
            firstPendingOrderId = msg.order_id
          }
          const sec = msg.sector || 'Operador'
          breakdownMap[sec] = (breakdownMap[sec] || 0) + 1
        }

        // Não lidas
        if (!msg.read) {
          unreadCount += 1
          if (!firstPendingOrderId && msg.order_id) {
            firstPendingOrderId = msg.order_id
          }
        }
      }
    } else {
      // VISÃO DOS SETORES (Comercial, Acabamento, Fabricação, Montagem, Expedição, Operador):
      // Vê respostas do PCP no canal dele e novidades das perguntas
      for (const msg of messages) {
        const time = new Date(msg.created).getTime()
        if (time > latestCreatedTime) latestCreatedTime = time

        const msgSector = msg.sector || 'Operador'
        if (userChannel && msgSector !== userChannel) continue

        const msgFromPcp = isPcpSender(msg)

        // Respostas do PCP não lidas
        if (msgFromPcp && !msg.read && msg.user_id !== user.id) {
          unreadCount += 1
          if (msg.reply_to || msg.type === 'Informação') {
            pcpAnsweredCount += 1
          }
          if (!firstPendingOrderId && msg.order_id) {
            firstPendingOrderId = msg.order_id
          }
        }

        // Perguntas próprias do setor que ainda aguardam resposta do PCP
        if (msg.type === 'Pergunta' && msg.status === 'Pendente' && msg.user_id === user.id) {
          pendingCount += 1
        }
      }
    }

    const sectorBreakdown: SectorBreakdown[] = Object.entries(breakdownMap)
      .map(([sec, count]) => ({ sector: sec as MessageSector, count }))
      .sort((a, b) => b.count - a.count)

    const totalItems = isPcp ? pendingCount + unreadCount : unreadCount + pendingCount

    return {
      hasPendencies: isPcp
        ? pendingCount > 0 || unreadCount > 0
        : unreadCount > 0 || pendingCount > 0,
      totalItems,
      pendingCount,
      unreadCount,
      pcpAnsweredCount,
      sectorBreakdown,
      latestCreatedTime,
      firstPendingOrderId,
    }
  }, [messages, user, isPcp, userChannel])

  // Identificador da versão atual de pendências (combina total + timestamp da mais recente)
  const currentFingerprint = useMemo(() => {
    return `${summary.totalItems}_${summary.latestCreatedTime}`
  }, [summary.totalItems, summary.latestCreatedTime])

  // Verifica se o usuário já viu esta versão ou se dispensou
  const isSeenOrDismissed = useMemo(() => {
    if (!summary.hasPendencies) return true
    if (dismissedKey === currentFingerprint) return true

    const lastSeen = getLastSeen()
    // Se a mensagem mais recente for anterior ou igual ao lastSeen, considera visto
    if (lastSeen && summary.latestCreatedTime > 0 && summary.latestCreatedTime <= lastSeen) {
      return true
    }

    return false
  }, [
    summary.hasPendencies,
    summary.latestCreatedTime,
    dismissedKey,
    currentFingerprint,
    getLastSeen,
  ])

  // Se estiver na própria página de comunicações, marca como visto e não exibe o banner
  useEffect(() => {
    if (location.pathname === '/pcp/comunicacoes' && summary.latestCreatedTime > 0) {
      setLastSeen(summary.latestCreatedTime || Date.now())
      setDismissedKey(currentFingerprint)
    }
  }, [location.pathname, summary.latestCreatedTime, currentFingerprint, setLastSeen])

  // Dismiss manual
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setLastSeen(summary.latestCreatedTime || Date.now())
    setDismissedKey(currentFingerprint)
  }

  // Clique no banner para ir direto à conversa/central
  const handleNavigate = () => {
    setLastSeen(summary.latestCreatedTime || Date.now())
    setDismissedKey(currentFingerprint)

    if (summary.firstPendingOrderId) {
      navigate(`/pcp/comunicacoes?orderId=${summary.firstPendingOrderId}`)
    } else {
      navigate('/pcp/comunicacoes')
    }
  }

  // Se houver erro de carga na comunicação, exibe um alerta sutil com botão de tentar novamente
  if (error && !summary.hasPendencies) {
    return (
      <aside
        aria-label="Erro na sincronização da Central de Comunicações"
        className="w-full bg-destructive text-destructive-foreground shadow-sm px-4 py-2 text-xs flex items-center justify-between gap-2"
      >
        <span>
          Não foi possível sincronizar as notificações da Central de Comunicações: {error}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          className="h-6 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
        >
          Tentar novamente
        </Button>
      </aside>
    )
  }

  if (loading || !summary.hasPendencies || isSeenOrDismissed) {
    return null
  }

  return (
    <aside
      aria-label="Pendências de Comunicação"
      className="w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white shadow-md border-b border-amber-600/40 transition-all animate-in slide-in-from-top-2 duration-300 relative z-20"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Lado Esquerdo: Ícone + Resumo contável */}
        <div
          onClick={handleNavigate}
          className="flex items-start sm:items-center gap-2.5 cursor-pointer flex-1 min-w-0 group"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleNavigate()
            }
          }}
        >
          <div className="p-1.5 rounded-lg bg-white/20 shrink-0 mt-0.5 sm:mt-0 flex items-center justify-center backdrop-blur-xs group-hover:bg-white/30 transition-colors">
            {isPcp ? (
              <Clock className="size-4.5 sm:size-5 animate-pulse text-white" />
            ) : (
              <Sparkles className="size-4.5 sm:size-5 text-white" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {isPcp ? (
              /* Resumo para PCP: perguntas pendentes por setor + não lidas */
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-wrap">
                <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white flex items-center gap-1.5">
                  <span>Central de Comunicações:</span>
                  <span className="underline decoration-white/60 underline-offset-2">
                    {summary.pendingCount > 0
                      ? `${summary.pendingCount} pergunta${summary.pendingCount > 1 ? 's' : ''} pendente${summary.pendingCount > 1 ? 's' : ''}`
                      : `${summary.unreadCount} mensagem${summary.unreadCount > 1 ? 's' : ''} não lida${summary.unreadCount > 1 ? 's' : ''}`}
                  </span>
                </span>

                {/* Detalhamento contável por setor */}
                {summary.sectorBreakdown.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[11px] text-white/80 hidden md:inline">por setor:</span>
                    {summary.sectorBreakdown.map((item) => {
                      const meta = SECTOR_VISUALS[item.sector] || SECTOR_VISUALS.Operador
                      const Icon = meta.icon
                      return (
                        <Badge
                          key={item.sector}
                          variant="secondary"
                          className="bg-black/25 hover:bg-black/35 text-white border-0 text-[10px] font-bold px-1.5 py-0 gap-1 backdrop-blur-xs"
                        >
                          <Icon className="size-2.5" />
                          <span>
                            {item.count} {item.sector}
                          </span>
                        </Badge>
                      )
                    })}
                  </div>
                )}

                {summary.unreadCount > 0 && summary.pendingCount > 0 && (
                  <span className="text-[11px] text-white/90 font-medium">
                    • {summary.unreadCount} não lida(s)
                  </span>
                )}
              </div>
            ) : (
              /* Resumo para os Setores: respostas do PCP e novidades */
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-wrap">
                <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white flex items-center gap-1.5">
                  <span>Novidades da Comunicação ({userChannel || 'Setor'}):</span>
                  <span className="underline decoration-white/60 underline-offset-2">
                    {summary.unreadCount > 0
                      ? `${summary.unreadCount} nova${summary.unreadCount > 1 ? 's' : ''} mensagem${summary.unreadCount > 1 ? 'ns' : ''} do PCP`
                      : `${summary.pendingCount} pergunta${summary.pendingCount > 1 ? 's' : ''} aguardando retorno`}
                  </span>
                </span>

                {summary.pcpAnsweredCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-black/25 text-white border-0 text-[10px] font-bold px-1.5 py-0 gap-1"
                  >
                    <CheckCircle2 className="size-2.5 text-emerald-300" />
                    <span>{summary.pcpAnsweredCount} resposta(s) do PCP</span>
                  </Badge>
                )}
              </div>
            )}

            <p className="text-[11px] text-white/90 truncate hidden sm:block mt-0.5">
              Clique para abrir direto na Caixa de Entrada e responder a conversa relevante.
            </p>
          </div>
        </div>

        {/* Lado Direito: Ações rápidas */}
        <div className="flex items-center justify-end gap-1.5 shrink-0">
          <Button
            size="sm"
            onClick={handleNavigate}
            className="h-7 text-xs bg-white text-amber-900 hover:bg-white/90 font-bold px-2.5 shadow-xs gap-1"
          >
            <MessageSquare className="size-3 text-amber-700" />
            <span>Ir à conversa</span>
            <ArrowRight className="size-3" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20 rounded-md shrink-0"
            title="Dispensar aviso (reaparece apenas se houver novidades)"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}

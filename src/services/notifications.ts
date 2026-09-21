import pb from '@/lib/pocketbase/client'

export interface AppNotification {
  id: string
  user_id: string
  message: string
  read: boolean
  action_url?: string
  created: string
  updated: string
  expand?: {
    user_id?: {
      id: string
      name: string
      email: string
    }
  }
}

/**
 * Busca notificações do usuário logado ordenadas pelas mais recentes.
 */
export async function getUserNotifications(limit = 30): Promise<AppNotification[]> {
  const currentUserId = pb.authStore.record?.id
  if (!currentUserId) return []

  try {
    const records = await pb.collection('notifications').getList<AppNotification>(1, limit, {
      filter: `user_id = "${currentUserId}"`,
      sort: '-created',
    })
    return records.items
  } catch (err) {
    console.error('Erro ao buscar notificações:', err)
    return []
  }
}

/**
 * Marca uma notificação como lida.
 */
export async function markNotificationAsRead(id: string): Promise<boolean> {
  try {
    await pb.collection('notifications').update(id, { read: true })
    return true
  } catch (err) {
    console.error('Erro ao marcar notificação como lida:', err)
    return false
  }
}

/**
 * Marca todas as notificações do usuário logado como lidas.
 */
export async function markAllNotificationsAsRead(): Promise<boolean> {
  const currentUserId = pb.authStore.record?.id
  if (!currentUserId) return false

  try {
    const unread = await pb.collection('notifications').getFullList<AppNotification>({
      filter: `user_id = "${currentUserId}" && read = false`,
    })
    await Promise.all(
      unread.map((notif) => pb.collection('notifications').update(notif.id, { read: true })),
    )
    return true
  } catch (err) {
    console.error('Erro ao marcar todas as notificações como lidas:', err)
    return false
  }
}

/**
 * Notifica os gestores do PCP (e administradores) sobre um evento importante,
 * como a conclusão de uma rodada de separação pelo operador.
 */
export async function notifyPcpManagers({
  message,
  actionUrl,
}: {
  message: string
  actionUrl?: string
}): Promise<number> {
  try {
    // 1. Identificar roles de gestão/administração/PCP
    const roles = await pb.collection('roles').getFullList({
      filter: 'active = true',
    })

    const managerRoleIds = roles
      .filter((r) => {
        const nameLower = (r.name || '').toLowerCase()
        return (
          r.access_pcp ||
          r.access_dashboard ||
          nameLower.includes('admin') ||
          nameLower.includes('gest') ||
          nameLower.includes('pcp')
        )
      })
      .map((r) => r.id)

    // 2. Buscar usuários com essas roles
    let targetUsers: { id: string }[] = []
    if (managerRoleIds.length > 0) {
      const roleFilter = managerRoleIds.map((id) => `role = "${id}"`).join(' || ')
      targetUsers = await pb.collection('users').getFullList({
        filter: `active = true && (${roleFilter})`,
      })
    }

    // Se nenhum gestor encontrado pelas roles, fallback para qualquer admin/ativo
    if (targetUsers.length === 0) {
      targetUsers = await pb.collection('users').getFullList({
        filter: 'active = true',
      })
    }

    const currentUserId = pb.authStore.record?.id
    let sentCount = 0

    for (const target of targetUsers) {
      // Opcional: não notificar a si próprio se quem finalizou já for o gestor
      try {
        await pb.collection('notifications').create({
          user_id: target.id,
          message,
          read: false,
          action_url: actionUrl || '/pcp/programacao',
        })
        sentCount++
      } catch (createErr) {
        console.warn('Erro ao criar notificação para gestor:', target.id, createErr)
      }
    }

    return sentCount
  } catch (err) {
    console.error('Erro ao notificar gestores do PCP:', err)
    return 0
  }
}

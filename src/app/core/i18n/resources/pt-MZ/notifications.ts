export const notifications = {
  title: 'Notificações',
  subtitle: {
    one: 'Alertas operacionais da frota · {count} por ler',
    other: 'Alertas operacionais da frota · {count} por ler',
  },
  subtitleAllRead: 'Alertas operacionais da frota · tudo lido',
  allCategories: 'Todas',
  categoryFilter: 'Filtrar por categoria',
  readFilter: {
    label: 'Filtrar por estado de leitura',
    all: 'Todas',
    unread: 'Por ler',
  },
  markAllRead: 'Marcar todas como lidas',
  open: 'Abrir',
  openRecord: 'Abrir registo relacionado',
  unread: 'Por ler',
  groups: {
    today: 'Hoje',
    yesterday: 'Ontem',
  },
  groupCount: {
    one: '{count} notificação',
    other: '{count} notificações',
  },
  preferencesLink: 'Preferências de notificação',
  demoNote: 'Notificações geradas a partir dos dados de demonstração. O estado de leitura fica guardado apenas neste navegador.',
  empty: {
    allTitle: 'Sem notificações',
    allDescription: 'Quando houver alertas de manutenção, documentos, viagens ou despesas, aparecem aqui.',
    unreadTitle: 'Está tudo em dia',
    unreadDescription: 'Não há notificações por ler neste filtro.',
    categoryTitle: 'Sem notificações nesta categoria',
    categoryDescription: 'Não existem notificações de «{category}» de momento.',
    showAll: 'Ver todas as notificações',
  },
  toasts: {
    allRead: 'Todas as notificações foram marcadas como lidas.',
    markedRead: 'Notificação marcada como lida.',
    markedUnread: 'Notificação marcada como não lida.',
  },
  categories: {
    maintenance: 'Manutenção',
    document: 'Documentos',
    trip_delay: 'Atrasos de viagem',
    fuel_anomaly: 'Combustível',
    expense_approval: 'Aprovação de despesas',
    system: 'Sistema',
  },
  severity: {
    info: 'Informação',
    warning: 'Aviso',
    critical: 'Crítico',
  },
  messages: {
    tripDelayed: {
      title: 'Viagem {trip} atrasada',
      body: 'A viagem {route} está atrasada em relação ao previsto.',
    },
    fuelAnomaly: {
      title: 'Leitura de combustível a verificar',
      body: 'O abastecimento {record} da viatura {vehicle} apresenta valores inconsistentes.',
    },
    expensesPending: {
      title: 'Despesas por aprovar',
      body: 'Existem {count} despesas a aguardar aprovação.',
    },
    documentExpired: {
      title: 'Documento expirado',
      body: '{document} expirou e deve ser renovado.',
    },
    documentExpiring: {
      title: 'Documento a expirar',
      body: '{document} expira dentro de {days} dias.',
    },
    licenceExpiring: {
      title: 'Carta de condução a expirar',
      body: 'A carta de condução de {driver} expira dentro de {days} dias.',
    },
    maintenanceOverdue: {
      title: 'Manutenção em atraso',
      body: 'A ordem {workOrder} da viatura {vehicle} ultrapassou a data prevista.',
    },
    maintenanceUpcoming: {
      title: 'Manutenção agendada',
      body: 'A ordem {workOrder} da viatura {vehicle} está agendada para {date}.',
    },
    maintenanceStarted: {
      title: 'Viatura em oficina',
      body: 'A viatura {vehicle} entrou em manutenção (ordem {workOrder}).',
    },
    userInvited: {
      title: 'Convite enviado',
      body: '{user} foi convidado para a organização.',
    },
  },
};

export const users = {
  title: 'Utilizadores e permissões',
  subtitleActive: {
    one: '{count} membro activo',
    other: '{count} membros activos',
  },
  subtitlePending: {
    one: '{count} convite pendente',
    other: '{count} convites pendentes',
  },
  roles: {
    owner: 'Proprietário',
    admin: 'Administrador',
    fleet_manager: 'Gestor de frota',
    dispatcher: 'Despachante',
    finance: 'Responsável financeiro',
    viewer: 'Apenas leitura',
  },
  roleDescriptions: {
    owner: 'Titular da conta da organização. Tem acesso total e não pode ser despromovido nem desactivado.',
    admin: 'Gere utilizadores, definições da empresa e todos os módulos operacionais e financeiros.',
    fleet_manager: 'Gere viaturas, motoristas, semi-reboques, documentos, manutenção e viagens, e regista custos.',
    dispatcher: 'Planeia e acompanha viagens, actualiza estados e consulta a frota.',
    finance: 'Regista e aprova despesas, consulta custos, rentabilidade e relatórios.',
    viewer: 'Consulta a frota, viagens, custos e relatórios sem poder alterar dados.',
  },
  status: {
    active: 'Activo',
    invited: 'Convidado',
    inactive: 'Inactivo',
  },
  banner: {
    title: 'Funções de demonstração',
    body: 'As funções e permissões aqui apresentadas são ilustrativas e não restringem o acesso nesta versão. O controlo de acesso real será aplicado no servidor (Supabase Auth com Row Level Security).',
  },
  views: {
    label: 'Secções de utilizadores',
    members: 'Membros',
    roles: 'Funções e permissões',
  },
  invite: 'Convidar utilizador',
  inviteDescription: 'O utilizador fica com o estado «Convidado» até aceitar o convite.',
  searchPlaceholder: 'Pesquisar por nome, e-mail ou cargo…',
  allRoles: 'Todas as funções',
  allStatuses: 'Todos',
  you: 'Você',
  never: 'Nunca',
  invitedAgo: 'Convidado {time}',
  ownerLockedHint: 'O proprietário não pode ser despromovido nem desactivado. A transferência de propriedade será tratada pelo suporte quando existir autenticação real.',
  empty: 'Ainda não existem utilizadores nesta organização.',
  columns: {
    user: 'Utilizador',
    jobTitle: 'Cargo',
    role: 'Função',
    status: 'Estado',
    lastActive: 'Última actividade',
  },
  fields: {
    fullName: 'Nome completo',
    email: 'E-mail',
    jobTitle: 'Cargo',
    role: 'Função',
  },
  hints: {
    email: 'Será o endereço de início de sessão quando a autenticação estiver disponível.',
    role: 'Pode alterar a função mais tarde. A função «Proprietário» não pode ser atribuída por convite.',
    noEmail: 'Demonstração: nenhum e-mail é enviado. O convite fica apenas registado neste navegador.',
  },
  actions: {
    changeRole: 'Alterar função',
    deactivate: 'Desactivar',
    reactivate: 'Reactivar',
    resendInvite: 'Reenviar convite',
    deleteInvite: 'Eliminar convite',
    viewPermissions: 'Ver permissões da função',
    sendInvite: 'Registar convite',
  },
  roleDialog: {
    title: 'Alterar função',
    description: 'Escolha a nova função de {name}.',
    current: 'Actual',
    confirm: 'Guardar função',
    demoNote: 'Demonstração: a função só altera o que é apresentado; as permissões reais serão aplicadas pelo servidor.',
  },
  confirm: {
    deactivateTitle: 'Desactivar {name}?',
    deactivateMessage: 'O utilizador deixa de aparecer como activo. Os registos que criou mantêm-se. Pode reactivá-lo a qualquer momento.',
    reactivateTitle: 'Reactivar {name}?',
    reactivateMessage: 'O utilizador volta a ficar activo com a função {role}.',
    deleteInviteTitle: 'Eliminar o convite de {name}?',
    deleteInviteMessage: 'O convite pendente é removido dos dados de demonstração.',
  },
  toasts: {
    invited: 'Convite registado para {name}.',
    invitedDetail: 'Nenhum e-mail foi enviado — esta é uma versão de demonstração.',
    resent: 'Convite reenviado para {email} (demonstração).',
    resentDetail: 'Nenhum e-mail é enviado nesta versão; a data do convite foi actualizada.',
    roleChanged: '{name} é agora {role}.',
    deactivated: '{name} foi desactivado.',
    reactivated: '{name} foi reactivado.',
    inviteDeleted: 'Convite de {name} eliminado.',
    ownerProtected: 'O proprietário não pode ser despromovido nem desactivado.',
  },
  validation: {
    emailTaken: 'Já existe um utilizador com este e-mail.',
  },
  csv: {
    fileName: 'utilizadores',
  },
  matrix: {
    title: 'Matriz de funções e permissões',
    subtitle: 'Mapeamento ilustrativo, apenas de leitura. Será validado pelas políticas de segurança do servidor.',
    permission: 'Permissão',
    allowed: 'Permitido',
    denied: 'Não permitido',
    rolesTitle: 'Funções disponíveis',
    permissionCount: {
      one: '{count} permissão',
      other: '{count} permissões',
    },
    memberCount: {
      one: '{count} membro',
      other: '{count} membros',
    },
  },
  permissions: {
    fleet: {
      view: 'Consultar frota',
      manage: 'Gerir frota',
    },
    trips: {
      view: 'Consultar viagens',
      manage: 'Gerir viagens',
    },
    costs: {
      view: 'Consultar custos',
      manage: 'Registar custos',
      approve: 'Aprovar despesas',
    },
    reports: {
      view: 'Consultar relatórios',
    },
    documents: {
      manage: 'Gerir documentos',
    },
    users: {
      manage: 'Gerir utilizadores',
    },
    settings: {
      manage: 'Gerir definições da empresa',
    },
  },
  permissionDescriptions: {
    fleet: {
      view: 'Ver viaturas, motoristas e semi-reboques.',
      manage: 'Criar, editar e alterar o estado de viaturas, motoristas e semi-reboques.',
    },
    trips: {
      view: 'Ver viagens, despacho e respectivo histórico.',
      manage: 'Criar viagens e actualizar o seu estado.',
    },
    costs: {
      view: 'Ver combustível, despesas, manutenção e rentabilidade.',
      manage: 'Registar abastecimentos, despesas e ordens de manutenção.',
      approve: 'Aprovar ou rejeitar despesas submetidas.',
    },
    reports: {
      view: 'Abrir e exportar relatórios.',
    },
    documents: {
      manage: 'Carregar e renovar documentos e licenças.',
    },
    users: {
      manage: 'Convidar utilizadores e alterar funções.',
    },
    settings: {
      manage: 'Alterar o perfil e as definições da empresa.',
    },
  },
};

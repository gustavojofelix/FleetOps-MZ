import type { users as source } from '../pt-MZ/users';
import { TranslationOf } from '../../translation.types';

export const users: TranslationOf<typeof source> = {
  title: 'Users & permissions',
  subtitleActive: {
    one: '{count} active member',
    other: '{count} active members',
  },
  subtitlePending: {
    one: '{count} pending invitation',
    other: '{count} pending invitations',
  },
  roles: {
    owner: 'Owner',
    admin: 'Administrator',
    fleet_manager: 'Fleet manager',
    dispatcher: 'Dispatcher',
    finance: 'Finance officer',
    viewer: 'Read-only viewer',
  },
  roleDescriptions: {
    owner: 'Holds the organization account. Full access; cannot be demoted or deactivated.',
    admin: 'Manages users, company settings and every operational and financial module.',
    fleet_manager: 'Manages vehicles, drivers, trailers, documents, maintenance and trips, and records costs.',
    dispatcher: 'Plans and follows trips, updates their status and views the fleet.',
    finance: 'Records and approves expenses, views costs, profitability and reports.',
    viewer: 'Views the fleet, trips, costs and reports without changing data.',
  },
  status: {
    active: 'Active',
    invited: 'Invited',
    inactive: 'Inactive',
  },
  banner: {
    title: 'Demonstration roles',
    body: 'The roles and permissions shown here are illustrative and do not restrict access in this version. Real access control will be enforced by the backend (Supabase Auth with Row Level Security).',
  },
  views: {
    label: 'User sections',
    members: 'Members',
    roles: 'Roles & permissions',
  },
  invite: 'Invite user',
  inviteDescription: 'The user stays “Invited” until they accept the invitation.',
  searchPlaceholder: 'Search by name, email or job title…',
  allRoles: 'All roles',
  allStatuses: 'All',
  you: 'You',
  never: 'Never',
  invitedAgo: 'Invited {time}',
  ownerLockedHint: 'The owner cannot be demoted or deactivated. Ownership transfer will be handled by support once real authentication exists.',
  empty: 'There are no users in this organization yet.',
  columns: {
    user: 'User',
    jobTitle: 'Job title',
    role: 'Role',
    status: 'Status',
    lastActive: 'Last active',
  },
  fields: {
    fullName: 'Full name',
    email: 'Email',
    jobTitle: 'Job title',
    role: 'Role',
  },
  hints: {
    email: 'Will be the sign-in address once authentication is available.',
    role: 'You can change the role later. The “Owner” role cannot be assigned by invitation.',
    noEmail: 'Demo: no email is sent. The invitation is only recorded in this browser.',
  },
  actions: {
    changeRole: 'Change role',
    deactivate: 'Deactivate',
    reactivate: 'Reactivate',
    resendInvite: 'Resend invitation',
    deleteInvite: 'Delete invitation',
    viewPermissions: 'View role permissions',
    sendInvite: 'Record invitation',
  },
  roleDialog: {
    title: 'Change role',
    description: 'Choose the new role for {name}.',
    current: 'Current',
    confirm: 'Save role',
    demoNote: 'Demo: the role only changes what is displayed; real permissions will be enforced by the backend.',
  },
  confirm: {
    deactivateTitle: 'Deactivate {name}?',
    deactivateMessage: 'The user will no longer be shown as active. Records they created are kept. You can reactivate them at any time.',
    reactivateTitle: 'Reactivate {name}?',
    reactivateMessage: 'The user becomes active again with the {role} role.',
    deleteInviteTitle: 'Delete the invitation for {name}?',
    deleteInviteMessage: 'The pending invitation is removed from the demo data.',
  },
  toasts: {
    invited: 'Invitation recorded for {name}.',
    invitedDetail: 'No email was sent — this is a demo version.',
    resent: 'Invitation resent to {email} (demo).',
    resentDetail: 'No email is sent in this version; the invitation date was updated.',
    roleChanged: '{name} is now {role}.',
    deactivated: '{name} was deactivated.',
    reactivated: '{name} was reactivated.',
    inviteDeleted: 'Invitation for {name} deleted.',
    ownerProtected: 'The owner cannot be demoted or deactivated.',
  },
  validation: {
    emailTaken: 'A user with this email already exists.',
  },
  csv: {
    fileName: 'users',
  },
  matrix: {
    title: 'Roles & permissions matrix',
    subtitle: 'Illustrative, read-only mapping. It will be enforced by the backend security policies.',
    permission: 'Permission',
    allowed: 'Allowed',
    denied: 'Not allowed',
    rolesTitle: 'Available roles',
    permissionCount: {
      one: '{count} permission',
      other: '{count} permissions',
    },
    memberCount: {
      one: '{count} member',
      other: '{count} members',
    },
  },
  permissions: {
    fleet: {
      view: 'View fleet',
      manage: 'Manage fleet',
    },
    trips: {
      view: 'View trips',
      manage: 'Manage trips',
    },
    costs: {
      view: 'View costs',
      manage: 'Record costs',
      approve: 'Approve expenses',
    },
    reports: {
      view: 'View reports',
    },
    documents: {
      manage: 'Manage documents',
    },
    users: {
      manage: 'Manage users',
    },
    settings: {
      manage: 'Manage company settings',
    },
  },
  permissionDescriptions: {
    fleet: {
      view: 'See vehicles, drivers and trailers.',
      manage: 'Create, edit and change the status of vehicles, drivers and trailers.',
    },
    trips: {
      view: 'See trips, dispatch and their history.',
      manage: 'Create trips and update their status.',
    },
    costs: {
      view: 'See fuel, expenses, maintenance and profitability.',
      manage: 'Record fuel fills, expenses and maintenance work orders.',
      approve: 'Approve or reject submitted expenses.',
    },
    reports: {
      view: 'Open and export reports.',
    },
    documents: {
      manage: 'Upload and renew documents and licences.',
    },
    users: {
      manage: 'Invite users and change roles.',
    },
    settings: {
      manage: 'Change the company profile and settings.',
    },
  },
};

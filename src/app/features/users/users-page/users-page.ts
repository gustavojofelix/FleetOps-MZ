import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { UserRepository } from '../../../core/data-access/repositories';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AppUser, USER_ROLES, USER_STATUSES, UserRole, UserStatus } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { Dropdown, DropdownTrigger } from '../../../shared/ui/dropdown/dropdown';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';
import { downloadCsv } from '../../../shared/utils/csv';
import { createListState } from '../../../shared/utils/list-state';
import { PermissionsMatrix } from '../permissions-matrix/permissions-matrix';
import { UserInviteForm } from '../user-invite-form/user-invite-form';
import { UserRoleDialog } from '../user-role-dialog/user-role-dialog';
import { UsersFacade } from '../users.facade';

type UsersView = 'members' | 'roles';
const VIEWS: readonly UsersView[] = ['members', 'roles'];

@Component({
  selector: 'app-users-page',
  imports: [
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    StatusBadge,
    EmptyState,
    Icon,
    Pagination,
    TableSkeleton,
    Dropdown,
    DropdownTrigger,
    Modal,
    TooltipDirective,
    UserInviteForm,
    UserRoleDialog,
    PermissionsMatrix,
  ],
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPage {
  private readonly repository = inject(UserRepository);
  private readonly facade = inject(UsersFacade);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  private readonly directory = inject(EntityDirectory);

  /** Query params bound by the router. */
  readonly status = input<string | undefined>();
  readonly role = input<string | undefined>();
  readonly view = input<string | undefined>();

  protected readonly roles = USER_ROLES;
  protected readonly statuses = USER_STATUSES;
  protected readonly views = VIEWS;
  protected readonly list = createListState({ pageSize: 10, sort: { field: 'fullName', direction: 'asc' } });
  protected readonly statusFilter = linkedSignal<UserStatus | null>(() => this.asStatus(this.status()));
  protected readonly roleFilter = linkedSignal<UserRole | null>(() => this.asRole(this.role()));
  protected readonly activeView = linkedSignal<UsersView>(() => (this.view() === 'roles' ? 'roles' : 'members'));

  protected readonly inviteOpen = signal(false);
  protected readonly roleTarget = signal<AppUser | null>(null);

  protected readonly query = createQuery(
    () => ({
      search: this.list.search(),
      status: this.statusFilter(),
      role: this.roleFilter(),
      sort: this.list.sort(),
      page: this.list.page(),
      pageSize: this.list.pageSize(),
      version: this.repository.changes(),
    }),
    (params) => this.repository.list(params),
  );

  protected readonly counts = computed(() => {
    const all = this.directory.users();
    const byStatus = new Map<UserStatus, number>();
    all.forEach((u) => byStatus.set(u.status, (byStatus.get(u.status) ?? 0) + 1));
    return { total: all.length, byStatus };
  });

  protected readonly hasFilters = computed(() => !!this.statusFilter() || !!this.roleFilter() || this.list.hasSearch());

  protected subtitle(): string {
    const counts = this.counts();
    return [
      this.i18n.t('users.subtitleActive', { count: counts.byStatus.get('active') ?? 0 }),
      this.i18n.t('users.subtitlePending', { count: counts.byStatus.get('invited') ?? 0 }),
    ].join(' · ');
  }

  protected initials(user: AppUser): string {
    return user.fullName
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .filter((_, index, parts) => index === 0 || index === parts.length - 1)
      .join('');
  }

  protected isCurrent(user: AppUser): boolean {
    return this.facade.isCurrentUser(user);
  }

  protected isProtected(user: AppUser): boolean {
    return this.facade.isProtected(user);
  }

  protected selectView(view: UsersView): void {
    this.activeView.set(view);
    void this.router.navigate([], { queryParams: { view: view === 'members' ? null : view }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onViewKeydown(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = VIEWS[(index + delta + VIEWS.length) % VIEWS.length];
    this.selectView(next);
    queueMicrotask(() => document.getElementById(`users-view-${next}`)?.focus());
  }

  protected setStatus(status: UserStatus | null): void {
    this.statusFilter.set(status);
    this.list.resetPage();
    this.syncUrl();
  }

  protected setRole(event: Event): void {
    this.roleFilter.set(this.asRole((event.target as HTMLSelectElement).value));
    this.list.resetPage();
    this.syncUrl();
  }

  protected clearFilters(): void {
    this.statusFilter.set(null);
    this.roleFilter.set(null);
    this.list.clearSearch();
    this.syncUrl();
  }

  protected onInvited(user: AppUser): void {
    this.inviteOpen.set(false);
    this.toast.success(this.i18n.t('users.toasts.invited', { name: user.fullName }), this.i18n.t('users.toasts.invitedDetail'));
  }

  protected openRoleDialog(user: AppUser): void {
    if (this.isProtected(user)) {
      this.toast.warning(this.i18n.t('users.toasts.ownerProtected'));
      return;
    }
    this.roleTarget.set(user);
  }

  protected async deactivate(user: AppUser): Promise<void> {
    if (this.isProtected(user) || this.isCurrent(user)) {
      this.toast.warning(this.i18n.t('users.toasts.ownerProtected'));
      return;
    }
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('users.confirm.deactivateTitle', { name: user.fullName }),
      message: this.i18n.t('users.confirm.deactivateMessage'),
      confirmLabel: this.i18n.t('users.actions.deactivate'),
    });
    if (!confirmed) return;
    await this.run(() => this.facade.deactivate(user), 'users.toasts.deactivated', user);
  }

  protected async reactivate(user: AppUser): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('users.confirm.reactivateTitle', { name: user.fullName }),
      message: this.i18n.t('users.confirm.reactivateMessage', { role: this.i18n.t('users.roles.' + user.role) }),
      confirmLabel: this.i18n.t('users.actions.reactivate'),
      tone: 'primary',
    });
    if (!confirmed) return;
    await this.run(() => this.facade.reactivate(user), 'users.toasts.reactivated', user);
  }

  protected async resendInvite(user: AppUser): Promise<void> {
    try {
      await this.facade.resendInvite(user);
      this.toast.info(this.i18n.t('users.toasts.resent', { email: user.email }), this.i18n.t('users.toasts.resentDetail'));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  protected async deleteInvite(user: AppUser): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('users.confirm.deleteInviteTitle', { name: user.fullName }),
      message: this.i18n.t('users.confirm.deleteInviteMessage'),
      confirmLabel: this.i18n.t('users.actions.deleteInvite'),
    });
    if (!confirmed) return;
    await this.run(() => this.facade.deleteInvite(user), 'users.toasts.inviteDeleted', user);
  }

  protected async exportCsv(): Promise<void> {
    const result = await this.repository.list({
      search: this.list.search(),
      status: this.statusFilter(),
      role: this.roleFilter(),
      sort: this.list.sort(),
    });
    const t = (key: string) => this.i18n.t(key);
    downloadCsv(
      `${t('users.csv.fileName')}-${this.clock.today()}`,
      [t('users.fields.fullName'), t('users.fields.email'), t('users.fields.jobTitle'), t('users.fields.role'), t('users.columns.status'), t('users.columns.lastActive')],
      result.items.map((u) => [u.fullName, u.email, u.jobTitle, t(`users.roles.${u.role}`), t(`users.status.${u.status}`), u.lastActiveAt ? this.format.date(u.lastActiveAt, 'datetime') : '']),
    );
    this.toast.success(t('common.toasts.exported'));
  }

  private async run(action: () => Promise<unknown>, successKey: string, user: AppUser): Promise<void> {
    try {
      await action();
      this.toast.success(this.i18n.t(successKey, { name: user.fullName }));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      queryParams: { status: this.statusFilter(), role: this.roleFilter() },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private asStatus(value: string | null | undefined): UserStatus | null {
    return USER_STATUSES.includes(value as UserStatus) ? (value as UserStatus) : null;
  }

  private asRole(value: string | null | undefined): UserRole | null {
    return USER_ROLES.includes(value as UserRole) ? (value as UserRole) : null;
  }
}

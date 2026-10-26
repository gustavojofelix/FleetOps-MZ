import { ChangeDetectionStrategy, Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AppUser, UserRole } from '../../../core/models';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ASSIGNABLE_ROLES } from '../role-permissions';
import { UsersFacade } from '../users.facade';

/** Small dialog to change a member's role. The owner is never offered here. */
@Component({
  selector: 'app-user-role-dialog',
  imports: [Modal, TranslatePipe, Icon],
  templateUrl: './user-role-dialog.html',
  styleUrl: './user-role-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserRoleDialog {
  /** Dialog is open while a user is set. */
  readonly user = input<AppUser | null>(null);
  readonly closed = output<void>();

  private readonly facade = inject(UsersFacade);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  protected readonly roles = ASSIGNABLE_ROLES;
  protected readonly selected = linkedSignal<UserRole>(() => this.user()?.role ?? 'viewer');
  protected readonly saving = signal(false);

  protected async confirm(): Promise<void> {
    const user = this.user();
    if (!user) return;
    const role = this.selected();
    this.saving.set(true);
    try {
      await this.facade.changeRole(user, role);
      this.toast.success(this.i18n.t('users.toasts.roleChanged', { name: user.fullName, role: this.i18n.t('users.roles.' + role) }));
      this.closed.emit();
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }
}

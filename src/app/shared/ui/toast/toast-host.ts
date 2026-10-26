import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icon-registry';
import { ToastService, ToastTone } from './toast.service';

@Component({
  selector: 'app-toast-host',
  imports: [Icon, TranslatePipe],
  templateUrl: './toast-host.html',
  styleUrl: './toast-host.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);

  protected icon(tone: ToastTone): IconName {
    const icons: Record<ToastTone, IconName> = {
      success: 'circle-check',
      error: 'circle-alert',
      warning: 'triangle-alert',
      info: 'info',
    };
    return icons[tone];
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Modal } from '../modal/modal';
import { ConfirmService } from './confirm.service';

@Component({
  selector: 'app-confirm-dialog-host',
  imports: [Modal, TranslatePipe],
  templateUrl: './confirm-dialog-host.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogHost {
  protected readonly confirm = inject(ConfirmService);
}

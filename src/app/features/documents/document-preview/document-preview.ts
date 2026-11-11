import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { FleetDocument } from '../../../core/models';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { ExpiryBadge } from '../../../shared/ui/expiry-badge/expiry-badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { DocumentsFacade } from '../documents.facade';
import { CanDirective } from '../../../shared/ui/can/can.directive';

/** Read-only preview of the document metadata, with a link to the stored file when there is one. */
@Component({
  selector: 'app-document-preview',
  imports: [Modal, RouterLink, TranslatePipe, ...FORMAT_PIPES, ExpiryBadge, Icon, CanDirective],
  templateUrl: './document-preview.html',
  styleUrl: './document-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentPreview {
  /** Dialog is open while a document is set. */
  readonly document = input<FleetDocument | null>(null);
  readonly closed = output<void>();
  readonly edit = output<FleetDocument>();
  readonly renew = output<FleetDocument>();

  private readonly facade = inject(DocumentsFacade);
  private readonly format = inject(FormatService);
  private readonly i18n = inject(TranslationService);
  protected readonly directory = inject(EntityDirectory);
  private readonly toast = inject(ToastService);

  protected readonly opening = signal(false);
  protected readonly canOpenFile = computed(() => !!this.document()?.fileName);

  protected async openFile(document: FleetDocument): Promise<void> {
    this.opening.set(true);
    // Open the tab synchronously (popup blockers), then point it at the signed URL.
    const tab = window.open('', '_blank');
    try {
      const url = await this.facade.fileUrl(document);
      if (!url) throw new Error('No stored file');
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (error) {
      console.error(error);
      tab?.close();
      this.toast.error(this.i18n.t('common.toasts.openFailed'));
    } finally {
      this.opening.set(false);
    }
  }

  protected readonly status = computed(() => {
    const document = this.document();
    return document ? this.facade.statusOf(document) : null;
  });
  protected readonly canRenew = computed(() => this.status() === 'expired' || this.status() === 'expiring');

  protected fileSize(sizeKb: number | null): string {
    if (!sizeKb) return '—';
    return sizeKb >= 1024
      ? this.i18n.t('documents.file.sizeMb', { size: this.format.number(sizeKb / 1024, 1) })
      : this.i18n.t('documents.file.sizeKb', { size: this.format.number(sizeKb) });
  }
}

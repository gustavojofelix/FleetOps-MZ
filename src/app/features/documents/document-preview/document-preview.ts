import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
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

/** Read-only preview: a mock page (nothing real is stored) next to the document metadata. */
@Component({
  selector: 'app-document-preview',
  imports: [Modal, RouterLink, TranslatePipe, ...FORMAT_PIPES, ExpiryBadge, Icon],
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

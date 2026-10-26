import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { paginate } from '../../../core/data-access/query-utils';
import { DocumentRepository } from '../../../core/data-access/repositories';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  DocumentStatus,
  DocumentType,
  ENTITY_TYPES,
  EntityType,
  FleetDocument,
} from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { CompanySettingsService } from '../../../core/state/company-settings.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { Dropdown, DropdownTrigger } from '../../../shared/ui/dropdown/dropdown';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ExpiryBadge } from '../../../shared/ui/expiry-badge/expiry-badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icon-registry';
import { Modal } from '../../../shared/ui/modal/modal';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { downloadCsv } from '../../../shared/utils/csv';
import { createListState } from '../../../shared/utils/list-state';
import { DocumentForm, DocumentFormMode, DocumentPreset } from '../document-form/document-form';
import { DocumentPreview } from '../document-preview/document-preview';
import { DocumentsFacade } from '../documents.facade';

interface SummaryItem {
  status: DocumentStatus;
  icon: IconName;
  count: number;
  hint: string;
}

/** Summary order: what needs attention first. */
const SUMMARY_ORDER: readonly { status: DocumentStatus; icon: IconName }[] = [
  { status: 'expired', icon: 'file-x' },
  { status: 'expiring', icon: 'calendar-clock' },
  { status: 'valid', icon: 'file-check' },
  { status: 'no_expiry', icon: 'file-text' },
];

@Component({
  selector: 'app-documents-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    ExpiryBadge,
    EmptyState,
    Icon,
    Pagination,
    TableSkeleton,
    Dropdown,
    DropdownTrigger,
    Modal,
    TooltipDirective,
    DocumentForm,
    DocumentPreview,
  ],
  templateUrl: './documents-page.html',
  styleUrl: './documents-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsPage {
  private readonly repository = inject(DocumentRepository);
  private readonly facade = inject(DocumentsFacade);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  private readonly settings = inject(CompanySettingsService);
  protected readonly directory = inject(EntityDirectory);

  /** Query params bound by the router (dashboard, notifications, global search). */
  readonly status = input<string | undefined>();
  readonly type = input<string | undefined>();
  readonly entityType = input<string | undefined>();
  readonly q = input<string | undefined>();

  protected readonly statuses = DOCUMENT_STATUSES;
  protected readonly types = DOCUMENT_TYPES;
  protected readonly entityTypes = ENTITY_TYPES;
  protected readonly warningDays = this.settings.expiryWarningDays;

  protected readonly list = createListState({ pageSize: 10, sort: { field: 'expiryDate', direction: 'asc' } });
  protected readonly statusFilter = linkedSignal<DocumentStatus | null>(() => this.asStatus(this.status()));
  protected readonly typeFilter = linkedSignal<DocumentType | null>(() => this.asType(this.type()));
  protected readonly entityTypeFilter = linkedSignal<EntityType | null>(() => this.asEntityType(this.entityType()));

  protected readonly formOpen = signal(false);
  protected readonly formMode = signal<DocumentFormMode>('create');
  protected readonly editing = signal<FleetDocument | null>(null);
  protected readonly preset = signal<DocumentPreset | null>(null);
  protected readonly previewing = signal<FleetDocument | null>(null);

  protected readonly query = createQuery(
    () => ({
      search: this.list.search(),
      status: this.statusFilter(),
      type: this.typeFilter(),
      entityType: this.entityTypeFilter(),
      sort: this.list.sort(),
      page: this.list.page(),
      pageSize: this.list.pageSize(),
      warningDays: this.warningDays(),
      version: this.repository.changes(),
    }),
    async (params) => {
      // Status is derived with the company warning window, so it is filtered here.
      const result = await this.repository.list({ search: params.search, type: params.type, entityType: params.entityType, sort: params.sort });
      const items = params.status ? result.items.filter((d) => this.facade.statusOf(d) === params.status) : result.items;
      return paginate(items, { page: params.page, pageSize: params.pageSize });
    },
  );

  protected readonly rows = computed(() =>
    (this.query.value()?.items ?? []).map((document) => ({ document, status: this.facade.statusOf(document) })),
  );

  /** Summary counts follow the type / entity filters (not the status itself). */
  protected readonly summary = computed<SummaryItem[]>(() => {
    this.i18n.revision();
    const type = this.typeFilter();
    const entityType = this.entityTypeFilter();
    const counts = new Map<DocumentStatus, number>();
    for (const document of this.directory.documents()) {
      if (type && document.type !== type) continue;
      if (entityType && document.entityType !== entityType) continue;
      const status = this.facade.statusOf(document);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    const hints: Record<DocumentStatus, string> = {
      expired: this.i18n.t('documents.summary.expiredHint'),
      expiring: this.i18n.t('documents.summary.expiringHint', { days: this.warningDays() }),
      valid: this.i18n.t('documents.summary.validHint'),
      no_expiry: this.i18n.t('documents.summary.noExpiryHint'),
    };
    return SUMMARY_ORDER.map(({ status, icon }) => ({ status, icon, count: counts.get(status) ?? 0, hint: hints[status] }));
  });

  protected readonly hasFilters = computed(
    () => !!this.statusFilter() || !!this.typeFilter() || !!this.entityTypeFilter() || this.list.hasSearch(),
  );

  constructor() {
    // `?q=` seeds the search box (e.g. from global search) whenever it changes.
    effect(() => {
      const q = this.q();
      untracked(() => {
        if (q !== undefined) this.list.setSearch(q);
      });
    });
  }

  // ---- Filters ----

  protected toggleStatus(status: DocumentStatus): void {
    this.statusFilter.set(this.statusFilter() === status ? null : status);
    this.list.resetPage();
    this.syncUrl();
  }

  protected setStatus(event: Event): void {
    this.statusFilter.set(this.asStatus((event.target as HTMLSelectElement).value));
    this.list.resetPage();
    this.syncUrl();
  }

  protected setType(event: Event): void {
    this.typeFilter.set(this.asType((event.target as HTMLSelectElement).value));
    this.list.resetPage();
    this.syncUrl();
  }

  protected setEntityType(event: Event): void {
    this.entityTypeFilter.set(this.asEntityType((event.target as HTMLSelectElement).value));
    this.list.resetPage();
    this.syncUrl();
  }

  protected clearFilters(): void {
    this.statusFilter.set(null);
    this.typeFilter.set(null);
    this.entityTypeFilter.set(null);
    this.list.clearSearch();
    this.syncUrl(true);
  }

  // ---- Actions ----

  protected openCreate(): void {
    this.editing.set(null);
    this.formMode.set('create');
    const type = this.typeFilter();
    const entityType = this.entityTypeFilter();
    this.preset.set(type || entityType ? { type: type ?? undefined, entityType: entityType ?? undefined } : null);
    this.formOpen.set(true);
  }

  protected openEdit(document: FleetDocument): void {
    this.previewing.set(null);
    this.editing.set(document);
    this.formMode.set('edit');
    this.formOpen.set(true);
  }

  protected openRenew(document: FleetDocument): void {
    this.previewing.set(null);
    this.editing.set(document);
    this.formMode.set('renew');
    this.formOpen.set(true);
  }

  protected canRenew(status: DocumentStatus): boolean {
    return status === 'expired' || status === 'expiring';
  }

  protected formTitle(): string {
    const mode = this.formMode();
    return this.i18n.t(mode === 'renew' ? 'documents.renew' : mode === 'edit' ? 'documents.edit' : 'documents.new');
  }

  protected formDescription(): string {
    const document = this.editing();
    const mode = this.formMode();
    if (mode === 'renew' && document) return this.i18n.t('documents.renewDescription', { reference: document.reference });
    if (mode === 'edit' && document) return this.i18n.t('documents.editDescription', { reference: document.reference });
    return this.i18n.t('documents.newDescription');
  }

  protected onSaved(document: FleetDocument): void {
    const mode = this.formMode();
    this.formOpen.set(false);
    if (mode === 'renew') {
      this.toast.success(
        this.i18n.t('documents.toasts.renewed', {
          reference: document.reference,
          date: document.expiryDate ? this.format.date(document.expiryDate) : '—',
        }),
      );
    } else {
      this.toast.success(this.i18n.t(mode === 'edit' ? 'documents.toasts.updated' : 'documents.toasts.created', { reference: document.reference }));
    }
  }

  protected async remove(document: FleetDocument): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('documents.confirmDelete.title', { reference: document.reference }),
      message: this.i18n.t('documents.confirmDelete.message'),
      confirmLabel: this.i18n.t('common.actions.delete'),
    });
    if (!confirmed) return;
    try {
      await this.facade.delete(document);
      this.toast.success(this.i18n.t('documents.toasts.deleted', { reference: document.reference }));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  protected async exportCsv(): Promise<void> {
    const result = await this.repository.list({
      search: this.list.search(),
      type: this.typeFilter(),
      entityType: this.entityTypeFilter(),
      sort: this.list.sort(),
    });
    const status = this.statusFilter();
    const items = status ? result.items.filter((d) => this.facade.statusOf(d) === status) : result.items;
    const t = (key: string) => this.i18n.t(key);
    downloadCsv(
      `${t('documents.csv.fileName')}-${this.clock.today()}`,
      [
        t('documents.fields.reference'),
        t('documents.fields.title'),
        t('documents.fields.type'),
        t('documents.fields.entityType'),
        t('documents.fields.entity'),
        t('documents.fields.issuer'),
        t('documents.fields.issueDate'),
        t('documents.fields.expiryDate'),
        t('documents.fields.status'),
        t('documents.fields.file'),
        t('documents.fields.notes'),
      ],
      items.map((d) => [
        d.reference,
        d.title,
        t(`documents.types.${d.type}`),
        t(`entities.${d.entityType}`),
        this.directory.entityLabel(d.entityType, d.entityId),
        d.issuer,
        d.issueDate,
        d.expiryDate ?? '',
        t(`documents.status.${this.facade.statusOf(d)}`),
        d.fileName ?? '',
        d.notes,
      ]),
    );
    this.toast.success(t('common.toasts.exported'));
  }

  // ---- Presentation helpers ----

  protected subtitle(): string {
    const counts = new Map(this.summary().map((item) => [item.status, item.count]));
    return this.i18n.t('documents.subtitle', {
      total: this.format.number(this.directory.documents().length),
      expired: counts.get('expired') ?? 0,
      expiring: counts.get('expiring') ?? 0,
      days: this.warningDays(),
    });
  }

  protected fileSize(sizeKb: number | null): string {
    if (!sizeKb) return '';
    return sizeKb >= 1024
      ? this.i18n.t('documents.file.sizeMb', { size: this.format.number(sizeKb / 1024, 1) })
      : this.i18n.t('documents.file.sizeKb', { size: this.format.number(sizeKb) });
  }

  private syncUrl(clearQuery = false): void {
    void this.router.navigate([], {
      queryParams: {
        status: this.statusFilter(),
        type: this.typeFilter(),
        entityType: this.entityTypeFilter(),
        ...(clearQuery ? { q: null } : {}),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private asStatus(value: string | null | undefined): DocumentStatus | null {
    return DOCUMENT_STATUSES.includes(value as DocumentStatus) ? (value as DocumentStatus) : null;
  }

  private asType(value: string | null | undefined): DocumentType | null {
    return DOCUMENT_TYPES.includes(value as DocumentType) ? (value as DocumentType) : null;
  }

  private asEntityType(value: string | null | undefined): EntityType | null {
    return ENTITY_TYPES.includes(value as EntityType) ? (value as EntityType) : null;
  }
}

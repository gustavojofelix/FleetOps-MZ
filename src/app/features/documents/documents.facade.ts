import { Injectable, inject } from '@angular/core';
import { EntityInput } from '../../core/data-access/query.model';
import { DocumentRepository } from '../../core/data-access/repositories';
import { expiryStatus } from '../../core/domain/document-status';
import { addDays, daysBetween } from '../../core/formatting/date-utils';
import { TranslationService } from '../../core/i18n/translation.service';
import { DocumentStatus, DocumentType, EntityType, FleetDocument, IsoDate } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { EntityDirectory } from '../../core/services/entity-directory.service';
import { CompanySettingsService } from '../../core/state/company-settings.service';

export type DocumentInput = EntityInput<FleetDocument>;

export interface EntityOption {
  id: string;
  label: string;
}

const DEFAULT_VALIDITY_DAYS = 365;

/** Document register workflows (references, renewal proposals, entity look-ups). */
@Injectable({ providedIn: 'root' })
export class DocumentsFacade {
  private readonly repository = inject(DocumentRepository);
  private readonly directory = inject(EntityDirectory);
  private readonly settings = inject(CompanySettingsService);
  private readonly clock = inject(ClockService);
  private readonly i18n = inject(TranslationService);

  /** Status with the company's warning window (not the 30-day default). */
  statusOf(document: Pick<FleetDocument, 'expiryDate'>): DocumentStatus {
    return expiryStatus(document.expiryDate, this.clock.today(), this.settings.expiryWarningDays());
  }

  save(id: string | null, input: DocumentInput): Promise<FleetDocument> {
    return id ? this.repository.update(id, input) : this.repository.create(input);
  }

  delete(document: FleetDocument): Promise<void> {
    return this.repository.delete(document.id);
  }

  /** Next reference above the highest existing one: DOC-00912. */
  async nextReference(): Promise<string> {
    const max = (await this.repository.all()).reduce((highest, document) => {
      const match = /^DOC-(\d+)$/.exec(document.reference);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    return `DOC-${String(max + 1).padStart(5, '0')}`;
  }

  /** Records a document can be linked to, by entity type. */
  entityOptions(entityType: EntityType): EntityOption[] {
    const byLabel = (a: EntityOption, b: EntityOption) => a.label.localeCompare(b.label);
    switch (entityType) {
      case 'vehicle':
        return this.directory
          .vehicles()
          .map((v) => ({ id: v.id, label: `${v.plateNumber} · ${v.fleetNumber}` }))
          .sort(byLabel);
      case 'driver':
        return this.directory
          .drivers()
          .map((d) => ({ id: d.id, label: `${d.firstName} ${d.lastName}` }))
          .sort(byLabel);
      case 'trailer':
        return this.directory
          .trailers()
          .map((t) => ({ id: t.id, label: t.plateNumber }))
          .sort(byLabel);
      case 'trip':
        return this.directory
          .trips()
          .map((t) => ({ id: t.id, label: `${t.reference} · ${this.directory.routeLabel(t)}` }))
          .sort((a, b) => b.label.localeCompare(a.label));
      case 'customer':
        return this.directory
          .customers()
          .map((c) => ({ id: c.id, label: c.name }))
          .sort(byLabel);
    }
  }

  /** "Seguro — ABL-564-SF", the convention used by the existing register. */
  suggestTitle(type: DocumentType, entityType: EntityType, entityId: string | null): string {
    const typeLabel = this.i18n.t(`documents.types.${type}`);
    if (!entityId) return typeLabel;
    const entity = this.directory.entityLabel(entityType, entityId);
    return entity === '—' ? typeLabel : `${typeLabel} — ${entity}`;
  }

  /**
   * Proposed dates for a renewal: issued today, valid for as long as the previous document,
   * counted from the previous expiry when it is still in the future.
   */
  renewalDates(document: FleetDocument): { issueDate: IsoDate; expiryDate: IsoDate | null } {
    const today = this.clock.today();
    if (!document.expiryDate) return { issueDate: today, expiryDate: null };
    const duration = daysBetween(document.issueDate, document.expiryDate);
    const validity = duration > 0 ? duration : DEFAULT_VALIDITY_DAYS;
    const start = document.expiryDate > today ? document.expiryDate : today;
    return { issueDate: today, expiryDate: addDays(start, validity) };
  }
}

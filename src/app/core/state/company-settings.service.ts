import { Injectable, computed, inject, signal } from '@angular/core';
import { OrganizationRepository } from '../data-access/repositories';
import { Organization } from '../models';

/**
 * Company-wide settings (shared by all users of the organization), as opposed to the
 * personal preferences in PreferencesService.
 */
@Injectable({ providedIn: 'root' })
export class CompanySettingsService {
  private readonly repository = inject(OrganizationRepository);
  private readonly state = signal<Organization | null>(null);

  readonly organization = this.state.asReadonly();
  readonly reportingCurrency = computed(() => this.state()?.reportingCurrency ?? 'MZN');
  readonly dateFormat = computed(() => this.state()?.dateFormat ?? 'dd/MM/yyyy');
  readonly timeZone = computed(() => this.state()?.timeZone ?? 'Africa/Maputo');
  readonly distanceUnit = computed(() => this.state()?.distanceUnit ?? 'km');
  readonly volumeUnit = computed(() => this.state()?.volumeUnit ?? 'l');
  readonly expiryWarningDays = computed(() => this.state()?.notificationSettings.documentExpiryDays ?? 30);

  async load(): Promise<Organization> {
    const organization = await this.repository.get();
    this.state.set(organization);
    return organization;
  }

  async save(changes: Partial<Omit<Organization, 'id' | 'createdAt'>>): Promise<Organization> {
    const organization = await this.repository.update(changes);
    this.state.set(organization);
    return organization;
  }
}

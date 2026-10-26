import { Injectable, inject } from '@angular/core';
import { DEMO_STORAGE_PREFIX } from '../data-access/mock-collection';
import {
  CustomerRepository,
  DocumentRepository,
  DriverRepository,
  ExpenseRepository,
  FuelRepository,
  MaintenanceRepository,
  NotificationRepository,
  OrganizationRepository,
  TrailerRepository,
  TripRepository,
  UserRepository,
  VehicleRepository,
} from '../data-access/repositories';
import { CompanySettingsService } from '../state/company-settings.service';
import { localStore } from '../state/local-storage';

/** Demo-only utilities: restores the original fixtures after local experiments. */
@Injectable({ providedIn: 'root' })
export class DemoDataService {
  private readonly resettable = [
    inject(VehicleRepository),
    inject(DriverRepository),
    inject(TrailerRepository),
    inject(CustomerRepository),
    inject(TripRepository),
    inject(FuelRepository),
    inject(ExpenseRepository),
    inject(MaintenanceRepository),
    inject(DocumentRepository),
    inject(NotificationRepository),
    inject(UserRepository),
    inject(OrganizationRepository),
  ];
  private readonly settings = inject(CompanySettingsService);

  async resetAll(): Promise<void> {
    localStore.removeByPrefix(DEMO_STORAGE_PREFIX);
    this.resettable.forEach((repository) => repository.reset());
    await this.settings.load();
  }
}

import { Injectable, inject } from '@angular/core';
import { DEMO_STORAGE_PREFIX, MOCK_LATENCY_MS, delay } from '../data-access/mock-collection';
import { OrganizationRepository, RouteRepository } from '../data-access/repositories';
import { Organization, RouteDefinition } from '../models';
import { localStore } from '../state/local-storage';

const STORAGE_KEY = `${DEMO_STORAGE_PREFIX}organization`;

/** Company profile and settings for the demo organization. */
@Injectable()
export class MockSettingsService implements OrganizationRepository {
  private readonly latency = inject(MOCK_LATENCY_MS);
  private organization: Organization | null = null;

  async get(): Promise<Organization> {
    if (!this.organization) {
      const persisted = localStore.read<Organization>(STORAGE_KEY);
      const fixtures = (await import('../mock-data/organizations.json')).default as unknown as Organization[];
      this.organization = persisted ?? fixtures[0];
    }
    return structuredClone(this.organization);
  }

  async update(changes: Partial<Omit<Organization, 'id' | 'createdAt'>>): Promise<Organization> {
    await delay(this.latency);
    const current = await this.get();
    this.organization = { ...current, ...structuredClone(changes) };
    localStore.write(STORAGE_KEY, this.organization);
    return structuredClone(this.organization);
  }

  reset(): void {
    localStore.remove(STORAGE_KEY);
    this.organization = null;
  }
}

@Injectable()
export class MockRoutesService implements RouteRepository {
  async all(): Promise<RouteDefinition[]> {
    return (await import('../mock-data/routes.json')).default as unknown as RouteDefinition[];
  }
}

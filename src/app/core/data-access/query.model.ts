import { IsoDate } from '../models';

export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  field: string;
  direction: SortDirection;
}

/** Common list parameters; each repository extends this with its own typed filters. */
export interface ListQuery {
  search?: string;
  sort?: SortSpec | null;
  /** 1-based page index. Omit page/pageSize to receive every match. */
  page?: number;
  pageSize?: number;
}

export interface DateRangeFilter {
  from?: IsoDate | null;
  to?: IsoDate | null;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Fields assigned by the data layer, never supplied by forms. */
export type SystemFields = 'id' | 'organizationId' | 'createdAt' | 'updatedAt';

export type EntityInput<T> = Omit<T, Extract<keyof T, SystemFields>>;

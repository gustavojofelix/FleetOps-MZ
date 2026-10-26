import { AssignmentIssue } from '../../core/domain/trip-rules';
import { TranslationParams } from '../../core/i18n/translation.types';

export interface IssueFormatters {
  t: (key: string, params?: TranslationParams) => string;
  date: (value: string) => string;
  number: (value: number, digits?: number) => string;
}

/** Translation key prefix for the vocabulary used by an issue's `status` / `type` param. */
const STATUS_VOCABULARY: Partial<Record<AssignmentIssue['code'], string>> = {
  vehicle_unavailable: 'vehicles.status.',
  driver_unavailable: 'drivers.status.',
  trailer_unavailable: 'trailers.status.',
};

/** Human-readable, translated message for an assignment issue from `checkTripAssignment()`. */
export function describeIssue(issue: AssignmentIssue, f: IssueFormatters): string {
  const params: TranslationParams = { ...issue.params };
  const vocabulary = STATUS_VOCABULARY[issue.code];
  if (vocabulary && typeof issue.params['status'] === 'string') params['status'] = f.t(vocabulary + issue.params['status']);
  if (issue.code === 'trailer_incompatible' && typeof issue.params['type'] === 'string') {
    params['type'] = f.t('trailers.types.' + issue.params['type']);
  }
  if (typeof issue.params['date'] === 'string') params['date'] = f.date(issue.params['date']);
  if (typeof issue.params['weight'] === 'number') params['weight'] = f.number(issue.params['weight'], 1);
  if (typeof issue.params['capacity'] === 'number') params['capacity'] = f.number(issue.params['capacity'], 1);
  return f.t(`trips.issues.${issue.code}`, params);
}

/** Blocking issues first, then warnings. */
export function sortIssues(issues: readonly AssignmentIssue[]): AssignmentIssue[] {
  return [...issues].sort((a, b) => Number(b.blocking) - Number(a.blocking));
}

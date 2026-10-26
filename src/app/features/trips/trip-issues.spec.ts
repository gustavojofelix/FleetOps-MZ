import { AssignmentIssue } from '../../core/domain/trip-rules';
import { describeIssue, sortIssues } from './trip-issues';

const formatters = {
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : `[${key}]`),
  date: (value: string) => `date(${value})`,
  number: (value: number) => `n(${value})`,
};

describe('assignment issue messages', () => {
  it('translates status and type params with their vocabularies', () => {
    const issue: AssignmentIssue = { code: 'vehicle_unavailable', blocking: true, params: { status: 'maintenance' } };
    expect(describeIssue(issue, formatters)).toBe('trips.issues.vehicle_unavailable|{"status":"[vehicles.status.maintenance]"}');
    const trailer: AssignmentIssue = { code: 'trailer_incompatible', blocking: true, params: { type: 'tanker' } };
    expect(describeIssue(trailer, formatters)).toContain('[trailers.types.tanker]');
  });

  it('formats dates and weights', () => {
    const licence: AssignmentIssue = { code: 'driver_licence_expired', blocking: true, params: { date: '2026-10-01' } };
    expect(describeIssue(licence, formatters)).toContain('date(2026-10-01)');
    const overweight: AssignmentIssue = { code: 'overweight', blocking: true, params: { weight: 36, capacity: 34 } };
    expect(describeIssue(overweight, formatters)).toContain('"weight":"n(36)","capacity":"n(34)"');
  });

  it('lists blocking issues first', () => {
    const issues: AssignmentIssue[] = [
      { code: 'trailer_required', blocking: false, params: {} },
      { code: 'driver_busy', blocking: true, params: { trip: 'VG-2026-0001' } },
    ];
    expect(sortIssues(issues).map((issue) => issue.code)).toEqual(['driver_busy', 'trailer_required']);
  });
});

import { Driver, IncidentSeverity } from '../../core/models';
import { Tone } from '../../shared/ui/status-badge/status-tones';

export function driverName(driver: Pick<Driver, 'firstName' | 'lastName'>): string {
  return `${driver.firstName} ${driver.lastName}`;
}

export function driverInitials(driver: Pick<Driver, 'firstName' | 'lastName'>): string {
  return `${driver.firstName.charAt(0)}${driver.lastName.charAt(0)}`;
}

/** Incident severities use their own vocabulary (low / medium / high), so the tone is mapped here. */
export const INCIDENT_SEVERITY_TONES: Readonly<Record<IncidentSeverity, Tone>> = {
  low: 'info',
  medium: 'warning',
  high: 'danger',
};

export const INCIDENT_SEVERITIES: readonly IncidentSeverity[] = ['low', 'medium', 'high'];

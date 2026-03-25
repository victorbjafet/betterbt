/**
 * Service Level Types
 * Represents the current state of transit service
 */

export enum ServiceLevel {
  FULL_SERVICE = 'FULL_SERVICE',
  REDUCED_SERVICE = 'REDUCED_SERVICE',
  NO_SERVICE = 'NO_SERVICE',
  GAME_DAY = 'GAME_DAY',
  SPECIAL_SCHEDULE = 'SPECIAL_SCHEDULE',
}

export interface ServiceStatus {
  level: ServiceLevel;
  description: string;
  notes?: string;
  effectiveDate: Date;
}

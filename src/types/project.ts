/** A project is a folder identified by its canonical path, with optional alternate paths. */
export interface ProjectRecord {
  /** Unique identifier (UUID v4). */
  id: string;
  /** User-facing project label, typically the folder tail name. */
  name: string;
  /** Normalized canonical folder path for this project. */
  canonicalPath: string;
  /** Additional normalized paths associated with this project. */
  alternatePaths?: string[];
  createdAt: number;
  updatedAt: number;
  /** Maximum age of readable Mess entries. Defaults to 30 days. */
  messRetentionDays?: number;
  /** Initial unread window for a new Mess member. Defaults to 24 hours. */
  messJoinHorizonHours?: number;
  /** Minimum interval between best-effort Mess idle pokes. Defaults to 15 minutes. */
  messPokeCooldownMinutes?: number;
}

export interface MessProjectSettings {
  messRetentionDays: number;
  messJoinHorizonHours: number;
  messPokeCooldownMinutes: number;
}

export const DEFAULT_MESS_RETENTION_DAYS = 30;
export const DEFAULT_MESS_JOIN_HORIZON_HOURS = 24;
export const DEFAULT_MESS_POKE_COOLDOWN_MINUTES = 15;

/** Resolve optional persisted project settings without mutating the project record. */
export function getMessProjectSettings(project: Pick<ProjectRecord, 'messRetentionDays' | 'messJoinHorizonHours' | 'messPokeCooldownMinutes'>): MessProjectSettings {
  const retentionDays = positiveFiniteInteger(project.messRetentionDays, DEFAULT_MESS_RETENTION_DAYS);
  const joinHorizonHours = Math.min(
    positiveFiniteNumber(project.messJoinHorizonHours, DEFAULT_MESS_JOIN_HORIZON_HOURS),
    retentionDays * 24,
  );
  return {
    messRetentionDays: retentionDays,
    messJoinHorizonHours: joinHorizonHours,
    messPokeCooldownMinutes: positiveFiniteNumber(
      project.messPokeCooldownMinutes,
      DEFAULT_MESS_POKE_COOLDOWN_MINUTES,
    ),
  };
}

function positiveFiniteInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? Math.floor(value) : fallback;
}

function positiveFiniteNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback;
}

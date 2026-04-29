/**
 * Scheduled Task Types
 *
 * Task scheduling system for CLI sessions with plan references.
 */

export type ScheduledTaskStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
export type ScheduledTaskScheduleKind = 'once' | 'interval';
export type ScheduledTaskMode = 'spawn' | 'direct';

export interface ScheduledTask {
  id: string;
  title: string;
  description?: string;
  planIds: string[];
  initialPrompt: string;
  cliType: string;
  cliParams?: string;
  scheduledTime: Date;
  scheduleKind?: ScheduledTaskScheduleKind;
  intervalMs?: number;
  nextRunAt?: Date;
  dirPath: string;
  mode?: ScheduledTaskMode;
  targetSessionId?: string;
  status: ScheduledTaskStatus;
  sessionId?: string;
  createdAt: number;
  completedAt?: number;
  lastRunAt?: number;
  error?: string;
}

export interface CreateScheduledTaskParams {
  title: string;
  description?: string;
  planIds: string[];
  initialPrompt: string;
  cliType: string;
  cliParams?: string;
  scheduledTime: Date;
  scheduleKind?: ScheduledTaskScheduleKind;
  intervalMs?: number;
  dirPath: string;
  mode?: ScheduledTaskMode;
  targetSessionId?: string;
}

export interface UpdateScheduledTaskParams {
  title?: string;
  description?: string;
  planIds?: string[];
  initialPrompt?: string;
  cliType?: string;
  cliParams?: string;
  scheduledTime?: Date;
  scheduleKind?: ScheduledTaskScheduleKind;
  intervalMs?: number;
  dirPath?: string;
  mode?: ScheduledTaskMode;
  targetSessionId?: string;
}

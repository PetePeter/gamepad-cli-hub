import { CronExpressionParser } from 'cron-parser';

export interface CronValidationResult {
  valid: boolean;
  error?: string;
}

export class CronEngine {
  static validate(expression: string): CronValidationResult {
    const trimmed = expression.trim();
    if (!trimmed) return { valid: false, error: 'Cron expression is required' };

    try {
      CronExpressionParser.parse(trimmed);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  static isValid(expression: string): boolean {
    return this.validate(expression).valid;
  }

  static nextRunTime(expression: string, from = new Date()): Date {
    const interval = CronExpressionParser.parse(expression.trim(), { currentDate: from });
    return interval.next().toDate();
  }

  static nextRunTimeBeforeDate(expression: string, from = new Date(), endDate?: Date): Date | null {
    try {
      const interval = CronExpressionParser.parse(expression.trim(), {
        currentDate: from,
        ...(endDate ? { endDate } : {}),
      });
      return interval.next().toDate();
    } catch (error) {
      if (error instanceof Error && error.message.includes('Out of the time span range')) {
        return null;
      }
      throw error;
    }
  }
}

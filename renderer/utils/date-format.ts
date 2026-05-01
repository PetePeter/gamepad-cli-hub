/**
 * Date format utilities for consistent date/time display.
 *
 * Provides two functions:
 * - formatDate: converts timestamp to yyyy/mm/dd
 * - formatDateTime: converts timestamp/Date/ISO string to yyyy/mm/dd HH:mm
 *
 * Both use zero-padding for months, days, hours, and minutes.
 * Both return empty string for undefined, null, 0, or invalid inputs.
 */

/**
 * Pads a number to two digits with leading zero.
 *
 * @param num - number to pad
 * @returns two-digit string (e.g., "05", "15")
 */
function pad(num: number): string {
  return num.toString().padStart(2, '0');
}

/**
 * Formats a timestamp as yyyy/mm/dd.
 *
 * Uses UTC time. Returns empty string for:
 * - undefined input
 * - 0 (Unix epoch)
 * - small negative timestamps (> -1000000, likely input errors)
 * - invalid dates (NaN)
 *
 * @param timestamp - milliseconds since epoch (optional)
 * @returns formatted date string in yyyy/mm/dd or ''
 */
export function formatDate(timestamp?: number): string {
  // Reject undefined or null
  if (timestamp === undefined || timestamp === null) {
    return '';
  }

  // Reject 0 (epoch) and small negatives (likely input errors)
  if (timestamp === 0 || (timestamp > -1000000 && timestamp < 0)) {
    return '';
  }

  const date = new Date(timestamp);

  // Reject invalid dates (e.g., NaN)
  if (isNaN(date.getTime())) {
    return '';
  }

  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1); // getUTCMonth() is 0-indexed
  const day = pad(date.getUTCDate());

  return `${year}/${month}/${day}`;
}

/**
 * Formats a timestamp, Date object, or ISO string as yyyy/mm/dd HH:mm.
 *
 * Accepts:
 * - number: milliseconds since epoch
 * - Date: Date object
 * - string: ISO 8601 date string
 *
 * Uses UTC time. Returns empty string for:
 * - undefined or null input
 * - 0 (Unix epoch)
 * - small negative timestamps (> -1000000, likely input errors)
 * - invalid Date objects or strings
 *
 * @param value - timestamp, Date object, or ISO string (optional)
 * @returns formatted datetime string in yyyy/mm/dd HH:mm or ''
 */
export function formatDateTime(value?: number | Date | string): string {
  // Reject undefined or null
  if (value === undefined || value === null) {
    return '';
  }

  // Convert input to Date object
  let date: Date;

  if (typeof value === 'number') {
    // Reject 0 (epoch) and small negatives (likely input errors)
    if (value === 0 || (value > -1000000 && value < 0)) {
      return '';
    }
    date = new Date(value);
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    date = new Date(value);
  } else {
    return '';
  }

  // Reject invalid dates (NaN)
  if (isNaN(date.getTime())) {
    return '';
  }

  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1); // getUTCMonth() is 0-indexed
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());

  return `${year}/${month}/${day} ${hour}:${minute}`;
}

import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { parseISO, addDays, addHours, addMinutes, setHours, setMinutes } from 'date-fns';

export function toUTC(date: Date | string, timezone: string): Date {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return fromZonedTime(d, timezone);
}

export function fromUTC(date: Date | string, timezone: string): Date {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return toZonedTime(d, timezone);
}

export function formatInTimezone(date: Date, timezone: string, format: string = 'yyyy-MM-dd HH:mm:ss zzz'): string {
  return formatInTimeZone(date, timezone, format);
}

export function parseRelativeTime(input: string, timezone: string): Date | null {
  const now = new Date();
  const nowInTz = toZonedTime(now, timezone);
  const lower = input.toLowerCase().trim();

  // Handle "tomorrow at Xpm/am"
  const tomorrowMatch = lower.match(/tomorrow\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (tomorrowMatch) {
    let hours = parseInt(tomorrowMatch[1], 10);
    const minutes = tomorrowMatch[2] ? parseInt(tomorrowMatch[2], 10) : 0;
    const meridiem = tomorrowMatch[3]?.toLowerCase();

    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;

    let result = addDays(nowInTz, 1);
    result = setHours(result, hours);
    result = setMinutes(result, minutes);
    return fromZonedTime(result, timezone);
  }

  // Handle "today at Xpm/am", "at Xpm/am", or bare "Xpm/am"
  // Must come after "tomorrow" check to avoid matching "tomorrow at 4pm"
  const timeMatch = lower.match(/(?:today\s+)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3]?.toLowerCase();

    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;

    // Set time in the user's timezone for today
    let result = setHours(nowInTz, hours);
    result = setMinutes(result, minutes);
    const utcResult = fromZonedTime(result, timezone);

    // If already passed in the user's timezone, advance to tomorrow
    if (utcResult <= now) {
      let tomorrowResult = addDays(nowInTz, 1);
      tomorrowResult = setHours(tomorrowResult, hours);
      tomorrowResult = setMinutes(tomorrowResult, minutes);
      return fromZonedTime(tomorrowResult, timezone);
    }

    return utcResult;
  }

  // Handle "in X minutes/hours"
  const inMatch = lower.match(/in\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs)/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2].toLowerCase();

    if (unit.startsWith('min')) {
      return addMinutes(now, amount);
    } else if (unit.startsWith('hour') || unit.startsWith('hr')) {
      return addHours(now, amount);
    }
  }

  // Handle ISO date string
  try {
    const parsed = parseISO(input);
    if (!isNaN(parsed.getTime())) {
      // If it looks like a local time (no Z or offset), treat as timezone-local
      if (!input.includes('Z') && !input.match(/[+-]\d{2}:?\d{2}$/)) {
        return fromZonedTime(parsed, timezone);
      }
      return parsed;
    }
  } catch {
    // Not a valid ISO date
  }

  return null;
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAY_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export const DEFAULT_SLEEP_DAYS = Object.freeze([1, 2, 3, 4, 5, 6, 0]);

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function uniqueValidDays(days, fallback) {
  if (!Array.isArray(days)) return [...fallback];
  const unique = [...new Set(days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return unique.length ? unique : [...fallback];
}

export function resolveSleepTimezone(timezone, fallback = "UTC") {
  const candidate = String(timezone || "").trim();
  if (!candidate) return fallback;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch (_) {
    return fallback;
  }
}

export function getDefaultSleepSchedule(
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
) {
  return {
    enabled: true,
    startHour: 22,
    startMinute: 0,
    endHour: 7,
    endMinute: 0,
    days: [...DEFAULT_SLEEP_DAYS],
    timezone: resolveSleepTimezone(timezone, "UTC"),
  };
}

export function normalizeSleepSchedule(raw, baseSchedule = getDefaultSleepSchedule()) {
  const fallback = {
    ...getDefaultSleepSchedule(baseSchedule?.timezone),
    ...(baseSchedule || {}),
    days: uniqueValidDays(baseSchedule?.days, DEFAULT_SLEEP_DAYS),
  };

  return {
    enabled: raw?.enabled == null ? !!fallback.enabled : !!raw.enabled,
    startHour: clampInt(raw?.startHour, 0, 23, fallback.startHour),
    startMinute: clampInt(raw?.startMinute, 0, 59, fallback.startMinute),
    endHour: clampInt(raw?.endHour, 0, 23, fallback.endHour),
    endMinute: clampInt(raw?.endMinute, 0, 59, fallback.endMinute),
    days: uniqueValidDays(raw?.days, fallback.days),
    timezone: resolveSleepTimezone(raw?.timezone, fallback.timezone),
  };
}

function getDatePartsInTimezone(date, timezone) {
  const targetDate = date instanceof Date ? date : new Date(date);
  const safeTimezone = resolveSleepTimezone(timezone, "UTC");

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTimezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(targetDate);

    const weekday = parts.find((part) => part.type === "weekday")?.value || "";
    const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

    return {
      day: WEEKDAY_TO_INDEX[weekday] ?? targetDate.getDay(),
      minutes: hour * 60 + minute,
    };
  } catch (_) {
    return {
      day: targetDate.getDay(),
      minutes: targetDate.getHours() * 60 + targetDate.getMinutes(),
    };
  }
}

export function isSleepWindowNow(schedule, now = new Date()) {
  const normalized = normalizeSleepSchedule(schedule);
  if (!normalized.enabled) return false;

  const { day, minutes } = getDatePartsInTimezone(now, normalized.timezone);
  const start = normalized.startHour * 60 + normalized.startMinute;
  const end = normalized.endHour * 60 + normalized.endMinute;
  const activeDays = new Set(normalized.days);

  if (start === end) return false;

  if (start < end) {
    return activeDays.has(day) && minutes >= start && minutes < end;
  }

  if (minutes >= start) {
    return activeDays.has(day);
  }

  if (minutes < end) {
    const previousDay = (day + 6) % 7;
    return activeDays.has(previousDay);
  }

  return false;
}

export function getSleepModeTransition(state, now = new Date()) {
  const schedule = normalizeSleepSchedule(state?.schedule);
  const shouldSleepNow = isSleepWindowNow(schedule, now);
  const sleepModeActive = !!state?.isSleepModeActive;
  const monitorRunning = !!state?.isMonitorRunning;
  const wasRunningBeforeSleep = !!state?.wasRunningBeforeSleep;

  if (shouldSleepNow && !sleepModeActive) {
    return {
      enteredSleep: true,
      exitedSleep: false,
      pauseMonitor: monitorRunning,
      resumeMonitor: false,
      nextSleepModeActive: true,
      nextMonitorRunning: false,
      nextWasRunningBeforeSleep: monitorRunning || wasRunningBeforeSleep,
    };
  }

  if (!shouldSleepNow && sleepModeActive) {
    return {
      enteredSleep: false,
      exitedSleep: true,
      pauseMonitor: false,
      resumeMonitor: wasRunningBeforeSleep,
      nextSleepModeActive: false,
      nextMonitorRunning: wasRunningBeforeSleep ? true : monitorRunning,
      nextWasRunningBeforeSleep: false,
    };
  }

  return {
    enteredSleep: false,
    exitedSleep: false,
    pauseMonitor: false,
    resumeMonitor: false,
    nextSleepModeActive: sleepModeActive,
    nextMonitorRunning: monitorRunning,
    nextWasRunningBeforeSleep: wasRunningBeforeSleep,
  };
}

import { useSyncExternalStore } from "react";

const settings = {
  speed: { key: "reading-speed", defaultValue: 12, min: 6, max: 60, step: 2 },
  fontSize: { key: "base-font-size", defaultValue: 100, min: 90, max: 125, step: 5 },
} as const;

export const readingSpeedSetting = settings.speed;
export const fontSizeSetting = settings.fontSize;

type ReadingPreference = keyof typeof settings;

const listeners = new Set<() => void>();
const temporaryPreferences: Partial<Record<ReadingPreference, number>> = {};

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function normalize(
  value: number,
  { defaultValue, min, max }: (typeof settings)[ReadingPreference],
) {
  return Number.isInteger(value) && value >= min && value <= max ? value : defaultValue;
}

function read(name: ReadingPreference) {
  const setting = settings[name];
  const temporary = temporaryPreferences[name];
  if (temporary !== undefined) return temporary;
  try {
    return normalize(Number(localStorage.getItem(setting.key)), setting);
  } catch {
    return setting.defaultValue;
  }
}

export function useReadingPreference(name: ReadingPreference) {
  return useSyncExternalStore(
    subscribe,
    () => read(name),
    () => settings[name].defaultValue,
  );
}

function applyFontSize(size: number) {
  document.documentElement.style.setProperty("--base-font-size", `${size}%`);
}

export function setReadingPreference(name: ReadingPreference, value: number) {
  const setting = settings[name];
  const next = normalize(value, setting);
  try {
    localStorage.setItem(setting.key, String(next));
    delete temporaryPreferences[name];
  } catch {
    temporaryPreferences[name] = next;
  }
  if (name === "fontSize") applyFontSize(next);
  for (const notify of listeners) notify();
}

export function resetReadingPreferences() {
  for (const name of ["speed", "fontSize"] as const) {
    delete temporaryPreferences[name];
    try {
      localStorage.removeItem(settings[name].key);
    } catch {
      // Use the defaults when browser storage is unavailable.
    }
  }
  applyFontSize(settings.fontSize.defaultValue);
  for (const notify of listeners) notify();
}

/** Apply the saved base font size before paint and update it when another tab changes it. */
export function createFontSizeScript(): string {
  const { key, min, max, defaultValue } = settings.fontSize;
  return `(function(){var k=${JSON.stringify(key)};function apply(){try{var n=Number(localStorage.getItem(k));document.documentElement.style.setProperty("--base-font-size",(Number.isInteger(n)&&n>=${min}&&n<=${max}?n:${defaultValue})+"%")}catch(e){}}apply();window.addEventListener("storage",function(e){if(e.key===k||e.key===null)apply()})})()`;
}

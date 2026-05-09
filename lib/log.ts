/* eslint-disable no-console */
// Always log in production too — Kris's preference: no silent failures.
// Tagged with severity so logcat is grep-able.
export const log = {
  debug: (...args: unknown[]): void => { console.log('[DEBUG]', ...args); },
  info:  (...args: unknown[]): void => { console.info('[INFO]', ...args); },
  warn:  (...args: unknown[]): void => { console.warn('[WARN]', ...args); },
  error: (...args: unknown[]): void => { console.error('[ERROR]', ...args); },
};

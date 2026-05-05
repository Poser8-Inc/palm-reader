// lib/log.ts — Templari structured logger shim
//
// Four severity levels. No-ops in production (__DEV__ === false). In dev,
// wraps the matching console.* function and prepends a level tag so logcat /
// Metro output is grep-able by severity.
//
// Convention: always prefix the message with [<app>][<module>] so the source
// of a warning is visible without a stack trace. Example:
//   log.warn('[palm][paywall-offerings] getOfferings failed:', err)
//
// Per Kris feedback_logging.md: DEBUG / INFO / WARN / ERROR, no silent
// failures, errors must carry enough context to act on. This shim is the
// React Native client implementation of that contract; the Edge Functions
// have their own logging path (server-side, not in scope).

/* eslint-disable no-console */
export const log = {
  debug: (...args: unknown[]): void => {
    if (__DEV__) console.log('[DEBUG]', ...args);
  },
  info: (...args: unknown[]): void => {
    if (__DEV__) console.info('[INFO]', ...args);
  },
  warn: (...args: unknown[]): void => {
    if (__DEV__) console.warn('[WARN]', ...args);
  },
  error: (...args: unknown[]): void => {
    if (__DEV__) console.error('[ERROR]', ...args);
  },
};

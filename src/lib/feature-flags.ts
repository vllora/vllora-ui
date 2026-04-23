/**
 * Feature flags — centralized toggle for gating features.
 *
 * Set VITE_LUCY_ENABLED=true in .env to re-enable Lucy AI assistant.
 */

export const IS_LUCY_ENABLED =
  import.meta.env.VITE_LUCY_ENABLED === 'true';

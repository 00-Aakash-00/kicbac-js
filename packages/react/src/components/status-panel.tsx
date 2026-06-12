import type { ReactNode } from "react";
import type { KicbacAppearanceElements } from "@kicbac/js";
import { cx } from "../internal/appearance.js";
import { loadErrorCopy } from "../internal/load-copy.js";

export interface KicbacStatusPanelProps {
  /** Internal load-error code (e.g. `missing_key`, `script_load_failed`). */
  code: string;
  /** The raw developer-facing message — shown only in development. */
  devMessage?: string;
  /** Retry handler; the button only renders when the failure is transient. */
  onRetry?: () => void;
  elements?: KicbacAppearanceElements;
  className?: string;
}

/**
 * Is the build running in production? Uses the canonical `process.env.NODE_ENV`
 * dot form that Vite/webpack/Next replace statically at build time (an
 * optional-chained/bracketed form is NOT replaced, which would leak the dev
 * note to shoppers in a browser prod bundle). Falls back to "not production"
 * only in unbundled environments with no `process`.
 */
function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === "production";
  } catch {
    return false;
  }
}

/**
 * The branded, consumer-safe fallback shown when the payment form cannot
 * mount its secure fields (missing key, blocked/failed Collect.js script…).
 * Replaces the input fields entirely so shoppers never see empty boxes or
 * developer error text. The real cause is surfaced to developers via a
 * dev-only note and `console.error` (in the provider).
 */
export function KicbacStatusPanel(props: KicbacStatusPanelProps): ReactNode {
  const { code, devMessage, onRetry, elements = {}, className } = props;
  const copy = loadErrorCopy(code);
  const showRetry = copy.retryable && typeof onRetry === "function";
  const showDev = !isProduction() && devMessage;

  return (
    <div
      className={cx("kb-status", elements.error, className)}
      role="alert"
      aria-live="assertive"
    >
      <span className="kb-status__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M12 8.5v4M12 16h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="kb-status__title">{copy.title}</p>
      <p className="kb-status__text">{copy.message}</p>
      {showRetry ? (
        <button type="button" className="kb-status__action" onClick={onRetry}>
          Try again
        </button>
      ) : null}
      {showDev ? (
        <p className="kb-status__dev">
          <span className="kb-status__dev-label">Developer</span>
          {` ${code}: ${devMessage}`}
        </p>
      ) : null}
    </div>
  );
}

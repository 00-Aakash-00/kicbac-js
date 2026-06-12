import { resolveTokenizationKey } from "./env.js";
import { KicbacLoadError } from "./errors.js";
import { createFieldSession } from "./session.js";
import type {
  CreateFieldSessionOptions,
  KicbacClient,
  LoadKicbacOptions,
} from "./types.js";

export const DEFAULT_COLLECT_SCRIPT_URL =
  "https://kicbac.transactiongateway.com/token/Collect.js";

const SCRIPT_TIMEOUT_MS = 20_000;
const COLLECTJS_POLL_INTERVAL_MS = 50;
const COLLECTJS_POLL_MAX_MS = 2_000;

interface LoaderState {
  key: string;
  scriptUrl: string;
  promise: Promise<KicbacClient | null>;
}

let loaderState: LoaderState | null = null;

/** @internal Test-only: clear the module-level loader cache. */
export function __resetLoaderState(): void {
  loaderState = null;
}

function missingKeyError(): KicbacLoadError {
  return new KicbacLoadError(
    "missing_key",
    "Missing Kicbac tokenization key. Pass it to loadKicbac()/<KicbacProvider> or set " +
      "NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY (Next.js) / VITE_KICBAC_TOKENIZATION_KEY (Vite) " +
      "in your environment.",
  );
}

function buildClient(key: string): KicbacClient {
  const collect = window.CollectJS;
  if (!collect) {
    throw new KicbacLoadError(
      "collectjs_missing",
      "Kicbac.js loaded but window.CollectJS is not defined.",
    );
  }
  return {
    collectJS: collect,
    tokenizationKey: key,
    createFieldSession(options: CreateFieldSessionOptions) {
      return createFieldSession(collect, options);
    },
  };
}

function findExistingScript(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>("script[data-tokenization-key]");
}

/** Poll for `window.CollectJS`; resolves the client or rejects after `maxMs`. */
function waitForCollectJS(
  key: string,
  maxMs: number,
  timeoutError: () => KicbacLoadError,
): Promise<KicbacClient> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (window.CollectJS) {
        resolve(buildClient(key));
        return;
      }
      if (Date.now() - startedAt >= maxMs) {
        reject(timeoutError());
        return;
      }
      setTimeout(check, COLLECTJS_POLL_INTERVAL_MS);
    };
    check();
  });
}

function injectAndLoad(key: string, options?: LoadKicbacOptions): Promise<KicbacClient> {
  return new Promise<KicbacClient>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      fn();
    };

    const overallTimer = setTimeout(() => {
      settle(() =>
        reject(
          new KicbacLoadError(
            "script_timeout",
            `Timed out after ${SCRIPT_TIMEOUT_MS / 1000}s waiting for Kicbac.js to load. ` +
              "Check your network connection and that your Content-Security-Policy allows " +
              "the Kicbac gateway domain.",
          ),
        ),
      );
    }, SCRIPT_TIMEOUT_MS);

    const existing = findExistingScript();
    if (existing) {
      // A merchant-managed <script> tag is already on the page — adopt it.
      waitForCollectJS(
        key,
        SCRIPT_TIMEOUT_MS,
        () =>
          new KicbacLoadError(
            "collectjs_missing",
            "Found an existing Kicbac.js script tag, but window.CollectJS never appeared. " +
              "Verify the script URL and tokenization key.",
          ),
      ).then(
        (client) => settle(() => resolve(client)),
        (error: unknown) => settle(() => reject(error)),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = options?.scriptUrl ?? DEFAULT_COLLECT_SCRIPT_URL;
    script.async = true;
    script.setAttribute("data-tokenization-key", key);
    script.setAttribute("data-variant", "inline");
    if (options?.nonce) script.nonce = options.nonce;

    script.onload = () => {
      waitForCollectJS(
        key,
        COLLECTJS_POLL_MAX_MS,
        () =>
          new KicbacLoadError(
            "collectjs_missing",
            "The Kicbac.js script loaded but did not initialize. This usually means an invalid " +
              "tokenization key — confirm NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY / " +
              "VITE_KICBAC_TOKENIZATION_KEY is your public tokenization key from the Kicbac dashboard.",
          ),
      ).then(
        (client) => settle(() => resolve(client)),
        (error: unknown) => settle(() => reject(error)),
      );
    };
    script.onerror = () => {
      script.remove();
      settle(() =>
        reject(
          new KicbacLoadError(
            "script_load_failed",
            "Failed to load the Kicbac.js script from the Kicbac gateway. Common causes: " +
              "no network connection; a Content-Security-Policy missing script-src/frame-src " +
              "for the gateway domain (kicbac.transactiongateway.com); or an ad blocker / " +
              "privacy extension blocking the request.",
          ),
        ),
      );
    };

    document.head.appendChild(script);
  });
}

/**
 * Load Kicbac.js once and resolve a typed Kicbac client.
 *
 * - SSR-safe: resolves `null` when `window` is undefined.
 * - Deduped: concurrent/subsequent calls with the same key share one promise.
 * - A different key while a load is cached rejects with `key_mismatch`
 *   (Kicbac.js supports one tokenization key per page).
 * - The script is injected exactly once, so `scriptUrl`/`nonce` from the
 *   FIRST call bind. A later call passing a different `scriptUrl` rejects with
 *   `key_mismatch` rather than silently ignoring it.
 * - A failed load clears the cache so the next call retries.
 */
export function loadKicbac(
  tokenizationKey?: string,
  options?: LoadKicbacOptions,
): Promise<KicbacClient | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  const key = resolveTokenizationKey(tokenizationKey);
  if (!key) return Promise.reject(missingKeyError());

  const scriptUrl = options?.scriptUrl ?? DEFAULT_COLLECT_SCRIPT_URL;

  if (loaderState) {
    if (loaderState.key !== key) {
      return Promise.reject(
        new KicbacLoadError(
          "key_mismatch",
          "Kicbac.js was already loaded with a different tokenization key. Only one " +
            "tokenization key can be used per page.",
        ),
      );
    }
    if (loaderState.scriptUrl !== scriptUrl) {
      return Promise.reject(
        new KicbacLoadError(
          "key_mismatch",
          "Kicbac.js was already loaded from a different scriptUrl. The script is loaded " +
            "once per page; pass the same scriptUrl (or none) to every loadKicbac() call.",
        ),
      );
    }
    return loaderState.promise;
  }

  const existing = findExistingScript();
  if (existing && existing.getAttribute("data-tokenization-key") !== key) {
    return Promise.reject(
      new KicbacLoadError(
        "key_mismatch",
        "A Kicbac.js script tag with a different data-tokenization-key already exists " +
          "on this page. Remove it or pass the same key to loadKicbac().",
      ),
    );
  }

  const promise = (
    window.CollectJS
      ? Promise.resolve(buildClient(key))
      : injectAndLoad(key, options)
  ).catch((error: unknown) => {
    // Clear the cache so a retry re-injects the script.
    loaderState = null;
    throw error;
  });

  loaderState = { key, scriptUrl, promise };
  return promise;
}

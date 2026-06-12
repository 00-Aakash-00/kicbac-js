import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { KicbacLoadError, loadKicbac } from "@kicbac/js";
import type { KicbacAppearance, KicbacClient, LoadKicbacOptions } from "@kicbac/js";
import { injectKicbacStyles } from "./styles/inject.js";

export interface KicbacContextValue {
  /** True once Kicbac.js has loaded (Clerk-style tri-state with `loadError`). */
  isLoaded: boolean;
  kicbac: KicbacClient | null;
  loadError: KicbacLoadError | null;
  appearance: KicbacAppearance | undefined;
  /** Re-attempt loading Kicbac.js after a transient failure (powers retry). */
  reload: () => void;
}

const KicbacContext = createContext<KicbacContextValue | null>(null);

export interface KicbacProviderProps {
  /**
   * Publishable tokenization key. Defaults to
   * `NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY` / `VITE_KICBAC_TOKENIZATION_KEY`.
   */
  tokenizationKey?: string;
  /** Default appearance for every Kicbac component below this provider. */
  appearance?: KicbacAppearance;
  /** Override the Kicbac.js script URL. */
  scriptUrl?: string;
  /** CSP nonce for the injected script and style tags. */
  nonce?: string;
  /** Set false to skip style injection and `import "@kicbac/react/styles.css"` yourself. */
  injectStyles?: boolean;
  children?: ReactNode;
}

/**
 * Loads Kicbac.js and provides the Kicbac client to the component tree.
 * A missing key or load failure never throws during render — it surfaces as
 * `useKicbac().loadError` and as the payment form's load error state.
 */
export function KicbacProvider(props: KicbacProviderProps): ReactNode {
  const { tokenizationKey, appearance, scriptUrl, nonce, injectStyles = true, children } = props;
  const [client, setClient] = useState<KicbacClient | null>(null);
  const [loadError, setLoadError] = useState<KicbacLoadError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setClient(null);
    setLoadError(null);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!injectStyles) return;
    injectKicbacStyles(nonce ? { nonce } : {});
  }, [injectStyles, nonce]);

  useEffect(() => {
    let cancelled = false;
    const options: LoadKicbacOptions = {
      ...(scriptUrl ? { scriptUrl } : {}),
      ...(nonce ? { nonce } : {}),
    };
    setLoadError(null);
    loadKicbac(tokenizationKey, options).then(
      (loaded) => {
        if (!cancelled && loaded) setClient(loaded);
      },
      (error: unknown) => {
        if (cancelled) return;
        const loadFailure =
          error instanceof KicbacLoadError
            ? error
            : new KicbacLoadError(
                "script_load_failed",
                error instanceof Error ? error.message : String(error),
              );
        // Surface the real cause to developers — the shopper sees only the
        // branded fallback panel, so this console line is their one signal.
        // eslint-disable-next-line no-console
        console.error(`[kicbac] Kicbac.js failed to load (${loadFailure.code}): ${loadFailure.message}`);
        setLoadError(loadFailure);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tokenizationKey, scriptUrl, nonce, reloadKey]);

  const value = useMemo<KicbacContextValue>(
    () => ({ isLoaded: client !== null, kicbac: client, loadError, appearance, reload }),
    [client, loadError, appearance, reload],
  );

  return <KicbacContext.Provider value={value}>{children}</KicbacContext.Provider>;
}

/** @internal */
export function useKicbacContext(): KicbacContextValue {
  const context = useContext(KicbacContext);
  if (!context) {
    throw new Error(
      "Kicbac components must be wrapped in <KicbacProvider>. Add it near the root of " +
        "your app (e.g. app/layout.tsx) — see https://docs.kicbac.com.",
    );
  }
  return context;
}

/**
 * Tri-state Kicbac.js loading status plus a `reload()` to re-attempt loading
 * after a transient failure: `{ isLoaded, kicbac, loadError, reload }`.
 */
export function useKicbac(): Pick<
  KicbacContextValue,
  "isLoaded" | "kicbac" | "loadError" | "reload"
> {
  const { isLoaded, kicbac, loadError, reload } = useKicbacContext();
  return { isLoaded, kicbac, loadError, reload };
}

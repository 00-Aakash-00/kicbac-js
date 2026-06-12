/**
 * Resolve the publishable tokenization key: explicit argument first, then
 * `NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY` (Next.js inlines the literal at build
 * time), then Vite's `VITE_KICBAC_TOKENIZATION_KEY`.
 */
export function resolveTokenizationKey(explicit?: string): string | undefined {
  if (explicit) return explicit;
  // The literal property access is required: bundlers replace the exact
  // `process.env.NEXT_PUBLIC_*` expression with a string at build time.
  if (typeof process !== "undefined" && typeof process.env !== "undefined") {
    const key = process.env.NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY;
    if (key) return key;
  }
  try {
    const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
    const key = metaEnv?.VITE_KICBAC_TOKENIZATION_KEY;
    if (key) return key;
  } catch {
    // import.meta.env is not available in this runtime — fall through.
  }
  return undefined;
}

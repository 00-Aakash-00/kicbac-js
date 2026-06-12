/** Read a required environment variable or throw an error naming it. */
export function requireEnv(name: string): string {
  const value =
    typeof process !== "undefined" && typeof process.env !== "undefined"
      ? process.env[name]
      : undefined;
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in your deployment ` +
        "environment (for local Next.js development: .env.local).",
    );
  }
  return value;
}

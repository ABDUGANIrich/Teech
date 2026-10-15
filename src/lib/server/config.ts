import "server-only";
export function configured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
export function liveConfigured() {
  return (
    configured() &&
    !!process.env.OPENROUTER_API_KEY &&
    (process.env.ANONYMOUS_HASH_SECRET?.length ?? 0) >= 32
  );
}
export function limit(name: string, fallback: number, ceiling = 1000) {
  const n = Number(process.env[name] ?? fallback);
  return Number.isInteger(n) && n > 0 && n <= ceiling ? n : fallback;
}

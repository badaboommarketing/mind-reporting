export interface AppConfig {
  databaseUrl: string | null;
  sessionSecret: string;
  googleClientId: string | null;
  googleClientSecret: string | null;
  googleCallbackUrl: string | null;
  googleAllowedDomain: string;
  host: string;
  port: number;
  appBaseUrl: string;
  demoMode: boolean;
  seedAdminEmail: string;
  seedAdminName: string;
}

export function loadConfig(env = process.env): AppConfig {
  const host = env.HOST ?? "127.0.0.1";
  const port = Number(env.PORT ?? 3000);
  const appBaseUrl = env.APP_BASE_URL ?? `http://${host}:${port}`;
  const demoMode = env.DEMO_MODE === "true" || !env.DATABASE_URL;

  return {
    databaseUrl: env.DATABASE_URL ?? null,
    sessionSecret: env.SESSION_SECRET ?? "development-session-secret",
    googleClientId: env.GOOGLE_CLIENT_ID ?? null,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? null,
    googleCallbackUrl: env.GOOGLE_CALLBACK_URL ?? `${appBaseUrl}/auth/google/callback`,
    googleAllowedDomain: env.GOOGLE_ALLOWED_DOMAIN ?? "bada.digital",
    host,
    port,
    appBaseUrl,
    demoMode,
    seedAdminEmail: env.SEED_ADMIN_EMAIL ?? "ops@bada.digital",
    seedAdminName: env.SEED_ADMIN_NAME ?? "Bada Admin",
  };
}

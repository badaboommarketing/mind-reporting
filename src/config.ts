export interface AppConfig {
  databaseUrl: string | null;
  sessionSecret: string;
  googleClientId: string | null;
  googleClientSecret: string | null;
  googleCallbackUrl: string | null;
  googleAllowedDomain: string;
  platformAdminEmails: string[];
  host: string;
  port: number;
  appBaseUrl: string;
  demoMode: boolean;
  seedAdminEmail: string;
  seedAdminName: string;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseEmailList(value: string | undefined): string[] {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function sanitizeConfiguredUrl(value: string | undefined, railwayPublicDomain: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (!railwayPublicDomain) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (isLocalHost(parsed.hostname)) {
      return null;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function loadConfig(env = process.env): AppConfig {
  const host = env.HOST ?? "0.0.0.0";
  const port = Number(env.PORT ?? 3000);
  const railwayPublicDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim();
  const inferredRailwayBaseUrl = railwayPublicDomain ? `https://${railwayPublicDomain}` : null;
  const appBaseUrl =
    sanitizeConfiguredUrl(env.APP_BASE_URL, railwayPublicDomain) ??
    inferredRailwayBaseUrl ??
    `http://127.0.0.1:${port}`;
  const demoMode = env.DEMO_MODE === "true" || !env.DATABASE_URL;
  const platformAdminEmails = new Set(parseEmailList(env.PLATFORM_ADMIN_EMAILS));
  if (env.SEED_ADMIN_EMAIL?.trim()) {
    platformAdminEmails.add(normalizeEmail(env.SEED_ADMIN_EMAIL));
  }

  return {
    databaseUrl: env.DATABASE_URL ?? null,
    sessionSecret: env.SESSION_SECRET ?? "development-session-secret",
    googleClientId: env.GOOGLE_CLIENT_ID ?? null,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? null,
    googleCallbackUrl:
      sanitizeConfiguredUrl(env.GOOGLE_CALLBACK_URL, railwayPublicDomain) ?? `${appBaseUrl}/auth/google/callback`,
    googleAllowedDomain: env.GOOGLE_ALLOWED_DOMAIN ?? "bada.digital",
    platformAdminEmails: [...platformAdminEmails],
    host,
    port,
    appBaseUrl,
    demoMode,
    seedAdminEmail: env.SEED_ADMIN_EMAIL ?? "ops@bada.digital",
    seedAdminName: env.SEED_ADMIN_NAME ?? "Bada Admin",
  };
}

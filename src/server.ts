import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import session from "express-session";
import multer from "multer";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import connectPgSimple from "connect-pg-simple";

import { loadConfig } from "./config.js";
import { createDatabaseService, createDemoService } from "./app/live-service.js";
import { asAppError, AppError } from "./lib/errors.js";
import {
  renderClientOnboardingPage,
  renderExceptionsPage,
  renderLoginPage,
  renderMissionControlPage,
  renderPerformancePage,
  renderScorecardPage,
  renderUploadsPage,
} from "./ui/render.js";
import { getPool } from "./db/pool.js";
import { METRIC_DEFINITIONS } from "./domain/metrics.js";
import { MetricKey, MetricStatus, ReviewException, UploadType } from "./domain/model.js";
import { PERFORMANCE_REPORT_DEFINITIONS } from "./domain/metrics.js";

const config = loadConfig();
const service = config.demoMode ? createDemoService() : createDatabaseService();
const upload = multer({ storage: multer.memoryStorage() });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

const app = express();
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/assets", express.static(publicDir));

if (!config.demoMode) {
  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        pool: getPool(),
        tableName: "sessions",
        createTableIfMissing: true,
      }),
      proxy: true,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 14,
      },
    }),
  );
} else {
  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
    }),
  );
}

app.use(passport.initialize());

if (config.googleClientId && config.googleClientSecret && config.googleCallbackUrl) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.googleClientId,
        clientSecret: config.googleClientSecret,
        callbackURL: config.googleCallbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            return done(new AppError(400, "Google account did not provide an email address."));
          }

          const domain = email.split("@")[1];
          if (domain !== config.googleAllowedDomain) {
            return done(new AppError(403, `Only ${config.googleAllowedDomain} accounts are allowed.`));
          }

          const user = await service.upsertGoogleUser({
            email,
            name: profile.displayName || email,
            googleSubject: profile.id,
          });
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      },
    ),
  );
}

async function currentUser(req: express.Request) {
  const sessionUserId = req.session.currentUserId;
  if (!sessionUserId) {
    return null;
  }
  return service.getCurrentUser(sessionUserId);
}

function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  currentUser(req)
    .then((user) => {
      if (!user) {
        res.redirect("/login");
        return;
      }
      res.locals.currentUser = user;
      next();
    })
    .catch(next);
}

function messageFromRequest(req: express.Request) {
  return typeof req.query.message === "string" ? req.query.message : null;
}

function errorFromRequest(req: express.Request) {
  return typeof req.query.error === "string" ? req.query.error : null;
}

function parseMonth(input: string | undefined): string {
  if (!input || !/^\d{4}-\d{2}$/.test(input)) {
    return new Date().toISOString().slice(0, 7);
  }
  return input;
}

function asSingle(value: unknown): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return String(value ?? "");
}

function buildClientInput(req: express.Request) {
  const metricTargets = Object.fromEntries(
    METRIC_DEFINITIONS.filter((metric) => metric.targetable).map((metric) => {
      const raw = req.body[`target_${metric.key}`];
      return [metric.key, raw ? Number(raw) : undefined];
    }),
  );

  const sourcePriorityByMetric = Object.fromEntries(
    [
      "total_spend",
      "leads",
      "strategy_calls",
      "triage_calls",
      "new_clients",
      "new_revenue_booked",
      "new_revenue_collected",
    ].map((metricKey) => [metricKey, req.body[`source_${metricKey}`]]),
  );

  return {
    name: req.body.name,
    reportingTimezone: req.body.reportingTimezone,
    reportingCurrency: req.body.reportingCurrency,
    spendBasis: req.body.spendBasis,
    leadDefinition: req.body.leadDefinition,
    newClientDefinition: req.body.newClientDefinition,
    pipelineMappingNotes: req.body.pipelineMappingNotes,
    bookingMappingNotes: req.body.bookingMappingNotes,
    revenueMappingNotes: req.body.revenueMappingNotes,
    duplicateRules: String(req.body.duplicateRules ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    manualImportSources: String(req.body.manualImportSources ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    defaultOwnerUserId: req.body.defaultOwnerUserId || null,
    metricTargets,
    sourcePriorityByMetric,
  };
}

app.get("/", async (req, res) => {
  if (req.session.currentUserId) {
    res.redirect("/app/mission-control");
    return;
  }
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.send(
    renderLoginPage({
      message: errorFromRequest(req),
      appMode: service.mode,
      googleEnabled: Boolean(config.googleClientId && config.googleClientSecret),
    }),
  );
});

app.post("/demo/login", async (req, res, next) => {
  try {
    if (service.mode !== "demo") {
      throw new AppError(404, "Demo login is disabled.");
    }
    const user = await service.getCurrentUser("user-admin");
    req.session.currentUserId = user?.id ?? "user-admin";
    res.redirect("/app/mission-control?message=Entered+demo+mode");
  } catch (error) {
    next(error);
  }
});

app.get("/auth/google", (req, res, next) => {
  if (!config.googleClientId || !config.googleClientSecret) {
    next(new AppError(500, "Google OAuth is not configured."));
    return;
  }
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    hd: config.googleAllowedDomain,
  })(req, res, next);
});

app.get("/auth/google/callback", (req, res, next) => {
  passport.authenticate("google", { session: false }, (error: unknown, user: any) => {
    if (error) {
      next(error);
      return;
    }
    if (!user) {
      next(new AppError(401, "Google login failed."));
      return;
    }
    req.session.currentUserId = user.id;
    res.redirect("/app/mission-control?message=Signed+in");
  })(req, res, next);
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login?message=Signed+out");
  });
});

app.get("/app/mission-control", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const clients = await service.listVisibleClients(user.id);
    const summary = await service.getMissionControl(user.id);
    res.send(
      renderMissionControlPage({
        user,
        clients,
        summary,
        currentPath: "/app/mission-control",
        notice: messageFromRequest(req),
        appMode: service.mode,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.get("/app/clients/new", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const clients = await service.listVisibleClients(user.id);
    res.send(
      renderClientOnboardingPage({
        user,
        clients,
        clientUsers: [user],
        currentPath: "/app/clients/new",
        notice: messageFromRequest(req),
        error: errorFromRequest(req),
        appMode: service.mode,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/app/clients", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const created = await service.createClient(user.id, buildClientInput(req));
    res.redirect(`/app/clients/${created.clientId}/uploads?message=Client+created`);
  } catch (error) {
    next(error);
  }
});

app.get("/app/clients/:clientId/uploads", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const clients = await service.listVisibleClients(user.id);
    const client = clients.find((entry) => entry.id === req.params.clientId);
    if (!client) {
      throw new AppError(404, "Unknown client.");
    }
    const batches = await service.listUploadBatches(user.id, client.id);
    res.send(
      renderUploadsPage({
        user,
        clients,
        client,
        batches,
        currentPath: `/app/clients/${client.id}/uploads`,
        notice: messageFromRequest(req),
        error: errorFromRequest(req),
        appMode: service.mode,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post(
  "/app/clients/:clientId/uploads/:uploadType",
  requireUser,
  upload.single("csvFile"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError(400, "Please attach a CSV file.");
      }
      const user = res.locals.currentUser;
      const result = await service.uploadCsv(user.id, {
        clientId: asSingle(req.params.clientId),
        uploadType: asSingle(req.params.uploadType) as UploadType,
        fileName: req.file.originalname,
        uploadedBy: user.id,
        csvText: req.file.buffer.toString("utf8"),
      });
      res.redirect(
        `/app/clients/${req.params.clientId}/uploads?message=Uploaded+${result.createdFacts}+facts+in+batch+${result.batchId}`,
      );
    } catch (error) {
      next(error);
    }
  },
);

app.get("/app/clients/:clientId/reports/:reportMonth", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const clients = await service.listVisibleClients(user.id);
    const clientId = asSingle(req.params.clientId);
    const reportMonth = asSingle(req.params.reportMonth);
    const client = clients.find((entry) => entry.id === clientId);
    if (!client) {
      throw new AppError(404, "Unknown client.");
    }
    const report = await service.getScorecard(user.id, client.id, reportMonth);
    const clientUsers = await service.listClientUsers(user.id, client.id);
    res.send(
      renderScorecardPage({
        user,
        clients,
        client,
        report,
        reportMonth,
        currentPath: `/app/clients/${client.id}/reports/${reportMonth}`,
        clientUsers,
        notice: messageFromRequest(req),
        error: errorFromRequest(req),
        appMode: service.mode,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/app/clients/:clientId/reports/:reportMonth/annotations", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const clientId = asSingle(req.params.clientId);
    const reportMonth = asSingle(req.params.reportMonth);
    await service.addAnnotation(user.id, {
      clientId,
      reportMonth,
      metricKey: asSingle(req.body.metricKey) as MetricKey,
      status: asSingle(req.body.status) as MetricStatus,
      ownerUserId: asSingle(req.body.ownerUserId) || null,
      sourceNote: asSingle(req.body.sourceNote) || null,
      riskNote: asSingle(req.body.riskNote) || null,
      manualOverrideValue: asSingle(req.body.manualOverrideValue) ? Number(asSingle(req.body.manualOverrideValue)) : null,
      overrideReason: asSingle(req.body.overrideReason) || null,
    });
    res.redirect(`/app/clients/${clientId}/reports/${reportMonth}?message=Metric+saved`);
  } catch (error) {
    next(error);
  }
});

app.post("/app/clients/:clientId/reports/:reportMonth/lock", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const clientId = asSingle(req.params.clientId);
    const reportMonth = asSingle(req.params.reportMonth);
    await service.lockReport(user.id, {
      clientId,
      reportMonth,
    });
    res.redirect(`/app/clients/${clientId}/reports/${reportMonth}?message=Month+locked`);
  } catch (error) {
    next(error);
  }
});

app.post("/app/clients/:clientId/reports/:reportMonth/unlock", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const clientId = asSingle(req.params.clientId);
    const reportMonth = asSingle(req.params.reportMonth);
    await service.unlockReport(user.id, {
      clientId,
      reportMonth,
    });
    res.redirect(`/app/clients/${clientId}/reports/${reportMonth}?message=Latest+lock+removed`);
  } catch (error) {
    next(error);
  }
});

app.get("/app/clients/:clientId/performance/:reportKey", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const reportMonth = parseMonth(req.query.month as string | undefined);
    const clients = await service.listVisibleClients(user.id);
    const clientId = asSingle(req.params.clientId);
    const reportKey = asSingle(req.params.reportKey);
    const client = clients.find((entry) => entry.id === clientId);
    if (!client) {
      throw new AppError(404, "Unknown client.");
    }
    const report = await service.getPerformanceReport(
      user.id,
      client.id,
      reportMonth,
      reportKey as any,
    );
    res.send(
      renderPerformancePage({
        user,
        clients,
        client,
        report,
        reportMonth,
        currentPath: `/app/clients/${client.id}/performance/${reportKey}`,
        appMode: service.mode,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.get("/app/clients/:clientId/exceptions", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const reportMonth = parseMonth(req.query.month as string | undefined);
    const clients = await service.listVisibleClients(user.id);
    const clientId = asSingle(req.params.clientId);
    const client = clients.find((entry) => entry.id === clientId);
    if (!client) {
      throw new AppError(404, "Unknown client.");
    }
    const exceptions = await service.listExceptions(user.id, client.id, reportMonth);
    res.send(
      renderExceptionsPage({
        user,
        clients,
        client,
        exceptions,
        reportMonth,
        currentPath: `/app/clients/${client.id}/exceptions`,
        appMode: service.mode,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/app/exceptions/:exceptionId/resolve", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    await service.resolveException(user.id, {
      exceptionId: asSingle(req.params.exceptionId),
      status: asSingle(req.body.status) as ReviewException["status"],
    });
    res.redirect("back");
  } catch (error) {
    next(error);
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    const health = await service.healthcheck();
    res.status(health.ok ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({
      ok: false,
      mode: service.mode,
      now: new Date().toISOString(),
      checks: {
        database: {
          ok: false,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown healthcheck error.",
        },
      },
    });
  }
});

app.get("/api/clients", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    res.json(await service.listVisibleClients(user.id));
  } catch (error) {
    next(error);
  }
});

app.get("/api/mission-control", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    res.json(await service.getMissionControl(user.id));
  } catch (error) {
    next(error);
  }
});

app.get("/api/clients/:clientId/reports/:reportMonth", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    res.json(await service.getScorecard(user.id, asSingle(req.params.clientId), asSingle(req.params.reportMonth)));
  } catch (error) {
    next(error);
  }
});

app.get("/api/clients/:clientId/report-definitions", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const clients = await service.listVisibleClients(user.id);
    const client = clients.find((entry) => entry.id === asSingle(req.params.clientId));
    if (!client) {
      throw new AppError(404, "Unknown client.");
    }
    res.json({
      clientId: client.id,
      scorecardMetrics: METRIC_DEFINITIONS.filter((definition) => definition.section !== "ad_performance"),
      performanceReports: PERFORMANCE_REPORT_DEFINITIONS,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/clients/:clientId/performance-reports/:reportKey", requireUser, async (req, res, next) => {
  try {
    const user = res.locals.currentUser;
    const reportMonth = parseMonth(req.query.month as string | undefined);
    res.json(
      await service.getPerformanceReport(
        user.id,
        asSingle(req.params.clientId),
        reportMonth,
        asSingle(req.params.reportKey) as any,
      ),
    );
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const appError = asAppError(error);
  if (req.path.startsWith("/api/")) {
    res.status(appError.statusCode).json({ error: appError.message });
    return;
  }

  if (req.path.startsWith("/app/")) {
    const destination = req.get("referer") || "/app/mission-control";
    const separator = destination.includes("?") ? "&" : "?";
    res.redirect(`${destination}${separator}error=${encodeURIComponent(appError.message)}`);
    return;
  }

  res.status(appError.statusCode).send(
    renderLoginPage({
      message: appError.message,
      appMode: service.mode,
      googleEnabled: Boolean(config.googleClientId && config.googleClientSecret),
    }),
  );
});

const server = app.listen(config.port, config.host, () => {
  console.log(`mind-reporting listening on ${config.appBaseUrl}`);
});

export { app, server };

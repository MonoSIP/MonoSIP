/**
 * Architectural boundary rules for MonoSIP.
 *
 * Enforced via: `pnpm arch:deps` (CI should fail on error-level violations).
 * Intended shape: routes → lib|asterisk|db ; jobs → lib|db|asterisk ;
 * asterisk → lib|db ; lib ↛ routes ; asterisk ↛ routes|jobs|web ;
 * shared is leaf ; web ↛ api internals.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular module graphs make change impact unpredictable.",
      from: {},
      to: { circular: true },
    },
    {
      name: "asterisk-not-routes",
      severity: "error",
      comment: "SIP/ARI/IVR must not depend on HTTP route modules.",
      from: { path: "^apps/api/src/asterisk" },
      to: { path: "^apps/api/src/routes" },
    },
    {
      name: "asterisk-not-jobs",
      severity: "error",
      comment: "Call path must not import background job schedulers.",
      from: { path: "^apps/api/src/asterisk" },
      to: { path: "^apps/api/src/jobs" },
    },
    {
      name: "lib-not-routes",
      severity: "error",
      comment: "Shared lib must not import Fastify route modules.",
      from: { path: "^apps/api/src/lib" },
      to: { path: "^apps/api/src/routes" },
    },
    {
      name: "jobs-not-routes",
      severity: "error",
      comment: "Workers must not import HTTP controllers.",
      from: { path: "^apps/api/src/jobs" },
      to: { path: "^apps/api/src/routes" },
    },
    {
      name: "db-not-routes",
      severity: "error",
      comment: "DB layer must not import HTTP controllers.",
      from: { path: "^apps/api/src/db" },
      to: { path: "^apps/api/src/routes" },
    },
    {
      name: "shared-is-leaf",
      severity: "error",
      comment: "@monosip/shared must not import apps/*.",
      from: { path: "^packages/shared/src" },
      to: { path: "^apps/" },
    },
    {
      name: "web-not-api-src",
      severity: "error",
      comment: "Web UI must not import API TypeScript sources (use HTTP + shared).",
      from: { path: "^apps/web/src" },
      to: { path: "^apps/api/src" },
    },
    {
      name: "ivr-not-http-transport",
      severity: "warn",
      comment:
        "Prefer keeping flow-logic free of Fastify/HTTP. flow-runtime may talk to ARI.",
      from: { path: "^apps/api/src/asterisk/flow-logic\\.ts$" },
      to: { path: "^apps/api/src/routes|^node_modules/fastify" },
    },
  ],
  options: {
    doNotFollow: {
      path: "(^|/)node_modules($|/)|(^|/)dist($|/)|(^|/)coverage($|/)|(^|/)reports($|/)|(^|/)drizzle($|/)",
    },
    exclude: {
      path: "\\.test\\.ts$|\\.int\\.test\\.ts$|/test/",
    },
    // Resolve .ts via TypeScript; without this, directory cruises can see 0 modules.
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "apps/api/tsconfig.json",
    },
    moduleSystems: ["es6", "cjs"],
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};


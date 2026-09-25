# IRIS Mission Control

**Manage. Diagnose. Secure. Integrate. Automate.**

An intelligent operations, security, FHIR and multi-cloud control plane for
**InterSystems IRIS**, built on the
[`/api/admin` SysAdmin APIs](https://github.com/intersystems-community/sysadmin-api-specification)
(IRIS 2026.2+). Not a re-skin of the classic Management Portal — it answers the
higher-level question: *is my IRIS environment healthy, and what needs attention?*

## Features

### Foundation — full modern management portal
- Live mission-control dashboard polling `/v2/monitor`
- Process task-manager (suspend / resume / terminate / broadcast)
- Databases & volumes, namespaces & mappings, devices, locks, web sessions,
  license, journal, ECP, work-queue manager, DocDB, filesystem access
- Security center: users, roles, resources, services, **permission matrix**,
  audit events, LDAP, SSL/TLS, encryption, web-auth, MFT, SQL privileges
  (grant/revoke), privileged routines
- Secrets: wallet collections, X.509 credentials, OAuth 2.0
- Task management: list, run, suspend, resume, history, upcoming
- Web applications + **built-in REST API explorer** over the full OpenAPI spec
- Unified log console (API activity + audit + task history + journal) with
  incident grouping

### Intelligence
- **Operations Center** (`/operations`) — per-subsystem rule-based assessment scores and a
  severity-ranked finding feed.
- **IRIS Doctor** (`/doctor`) — one-click diagnosis: runs every collector,
  evaluates deterministic rules, and produces **evidence-backed findings**
  with recommendations and deep links. Export the report as Markdown.
- Rules engine covers: database mount/read-only state, journal space &
  freeze-on-error, lock table, serious system alerts, never-backed-up
  instances, insecure/unauthenticated services & web apps, default accounts,
  disabled login auditing, suspended/failed tasks, expiring certificates,
  license saturation, runaway processes.
  Scores use one penalty per distinct finding type and are prioritization aids,
  not InterSystems health metrics. Collector failures are shown as incomplete data.

### AI & agent interface
- **MCP server** (`mcp-server/`, Streamable HTTP) — 16 read-only tools
  (`iris_get_health`, `iris_list_databases`, `iris_list_processes`,
  `iris_get_audit_events`, …) so Claude/ChatGPT/IDE agents can inspect the
  instance. Shares the portal's rules engine — the same findings the GUI shows.
  Every call is audited (sanitized args) and visible on the `/mcp` page.

### Healthcare
- **FHIR Control Center** — discovers `/fhir*` web apps, probes
  `/metadata`, tracks version/resources/latency.
- **FHIR Explorer** — Postman-style resource search/read.
- **CapabilityStatement visualizer** and **resource validator**.
- Ships with a labeled **synthetic demo server** (R4 CapabilityStatement +
  sample Patients/Observations/Encounters) so every screen works on plain
  IRIS Community Edition — on IRIS for Health it talks to real endpoints.

### Cloud
- Cloud secrets broker: live Azure Key Vault OAuth/client-credentials validation
  plus AWS Secrets Manager / GCP Secret Manager connection registry and the
  **IRIS wallet** as a local provider.
- Azure client secrets are resolved from the wallet at call time. Secret values
  and access tokens are never returned to the browser or written to logs.

### Observability
- **Time Machine** — capture operational snapshots, diff two points in time.
- **Configuration Drift** — snapshot users/roles/resources/web apps/services/
  SSL/journal and diff any two snapshots line-by-line.
- **Universal search & command palette** (`Ctrl+K`) — pages *and* live entities
  (databases, namespaces, users, roles, web apps, tasks).
- **Config export** — one-click JSON snapshot of the whole instance config.

## Quick start (Docker)

```bash
git clone https://github.com/Fruitkwan/IRIS_Mission_Control.git irisops
cd irisops
docker compose up -d --build
```

- Portal: **http://localhost:52773/irisops/** (log in with `_SYSTEM` / `SYS`)
- MCP endpoint for AI clients: **http://localhost:3333/mcp**
- MCP status/audit API: `http://localhost:3333/status`, `/tools`, `/audit`

> The `-zpm` base image's post-start hook can fail once on first boot
> (upstream `dbapi` regression) — `restart: unless-stopped` in compose handles
> it automatically.

## Install on an existing instance (ZPM)

Requires IRIS 2026.2+ and a prebuilt `web/` bundle (committed, or rebuild via
`cd frontend && npm ci && npm run build`).

```
zpm "load /path/to/irisops"
```

Registers two web applications:

- `/irisops` — serves the SPA via dispatch class `IrisOps.Router`
  (unauthenticated for the static shell; every API call is JWT-gated by
  `/api/admin`). Deploys assets to `${cspdir}/irisops`.
- `/irisops-broker` — JWT-authenticated dispatch to `IrisOps.CloudBroker`,
  which performs server-side cloud connection tests so secret values never
  reach the browser.

## MCP client setup

```json
{
  "mcpServers": {
    "irisops": { "url": "http://localhost:3333/mcp" }
  }
}
```

Then ask your MCP client: *"Check my IRIS instance and identify anything
requiring attention"* — it calls `iris_get_health` and returns the same
evidence-backed findings the portal shows.

Credentials are read by the MCP server from env (`IRIS_URL`, `IRIS_USER`,
`IRIS_PASSWORD` — see `.env.example`) and are never exposed to the browser.

## Development

```bash
# Terminal 1 — IRIS with SysAdmin APIs
docker run -d --name iris-dev -p 1972:1972 -p 52773:52773 \
  intersystemsdc/iris-community:2026.2-zpm

# Terminal 2 — frontend (proxies /api -> localhost:52773)
cd frontend && npm ci && npm run dev    # http://localhost:5173

# Terminal 3 — MCP server
cd mcp-server && npm install && IRIS_URL=http://localhost:52773/api/admin npm start
```

| Command | Purpose |
|---|---|
| `npm run generate` | Inject `operationId`s into the spec + regenerate the typed client (orval) |
| `npm run build` | Typecheck + production build into `web/` |
| `npm run lint` | oxlint |
| `npm test` | Rule engine, scoring and collector tests (frontend); secret-redaction tests (mcp-server) |

### Testing

`frontend/tests/health-rules.test.mjs` covers every IRIS Doctor rule. A
meta-test fails if a rule is added to `rules.ts` without a test case. Each rule
is tested for its trigger, severity, category, evidence and deep link. The
suite also covers thresholds, scoring and the rule that repeated resources
don't stack penalties. `frontend/tests/collectors.test.mjs` runs sample
SysAdmin API responses through the same collector the portal and MCP use,
including partial collector failures. CI (`.github/workflows/ci.yml`) runs
lint, tests and the production build. It also boots the MCP server, then
brings up the full Docker stack and waits for the IRIS healthcheck.

## Architecture

```
browser ──► /irisops/          CSP web app serves the SPA (static + IrisOps.Router)
        ──► /api/admin/...     SysAdmin REST APIs (JWT login + refresh)

mcp client ──► :3333/mcp       MCP server (Node, streamable HTTP)
                  └──► /api/admin  (same APIs, Basic auth from env)
```

- `frontend/` — React 19 + TypeScript + Tailwind v4 + TanStack Query + Axios.
  `src/api/generated/` is produced by orval from `spec/mainspec_v2.json` after
  `scripts/add-operation-ids.mjs` injects deterministic `operationId`s.
- `frontend/src/health/` — collectors → normalized telemetry → rules →
  findings + scores (shared by the portal *and* the MCP server).
- `frontend/src/fhir/`, `frontend/src/cloud/`, `frontend/src/observability/` —
  FHIR client/demo data, provider abstraction, snapshot engines.
- `src/cls/IrisOps/Router.cls` — CSP dispatch class (SPA entrypoint, deep-link
  fallback, `/irisops/health`, cloud-broker route).
- `src/cls/IrisOps/CloudBroker.cls` — server-side cloud connection tester
  (Azure Key Vault live validation; secrets stay server-side).
- `mcp-server/` — standalone MCP service.
- `module.xml`, `iris.script`, `Dockerfile`, `docker-compose.yml` — packaging.

## Security model

- JWT login (`/login`) with transparent refresh; Basic auth also supported by the API.
- All mutating endpoints go through the authenticated session; no arbitrary
  SQL/ObjectScript/shell execution is exposed.
- MCP tools are allow-listed and read-only; arguments are sanitized before audit.
- Cloud secret values are never rendered. Live connection tests retrieve one
  value inside the broker only to prove access, then immediately discard it.
- FHIR demo content is synthetic and clearly labeled.

## License

MIT

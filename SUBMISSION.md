# Open Exchange submission draft

Paste-ready listing text for the InterSystems Open Exchange submission form.

## App name

IRIS Mission Control

## Tagline / short description

Intelligent operations, security, FHIR and multi-cloud control plane for
InterSystems IRIS — manage, diagnose, and audit your instance from one modern UI.

## Full description

## What it is

IRIS Mission Control is a full management portal for InterSystems IRIS built on the
`/api/admin` SysAdmin APIs — plus an intelligence layer on top that answers the
question operators actually ask: *is my IRIS environment healthy, and what needs
attention right now?*

It is not a re-skin of the classic Management Portal. Everything the classic portal
manages is here, wrapped in a fast React/TypeScript UI with light & dark themes —
and then extended with features the classic portal doesn't have:

## Highlights

- **IRIS Doctor** — one-click diagnosis. Collectors pull databases, journal, locks,
  license, security config, tasks and alerts; a deterministic rules engine produces
  **evidence-backed findings** with recommendations and deep links to the exact page
  that fixes each one. Export the report as Markdown.
- **Operations Center** — per-subsystem health scores and a severity-ranked finding
  feed across the whole instance.
- **MCP server** — a Model Context Protocol sidecar exposes read-only IRIS tools
  (`iris_get_health`, process/database/audit queries) so AI assistants can inspect
  and reason about a live instance.
- **FHIR Control Center** — endpoint discovery, CapabilityStatement visualization,
  resource explorer and a client-side validator (with demo mode on non-FHIR editions).
- **Cloud secrets broker** — provider abstraction for Azure/AWS/GCP with an IRIS-side
  broker; secrets never reach the browser, only metadata and wallet references.
- **Time Machine & Config Drift** — point-in-time configuration snapshots and diffing.
- **Unified log console** — API activity, audit events, task history and journal in
  one stream with severity filtering and incident grouping.
- **Universal search** — command palette (Ctrl+K) navigates pages *and* entities
  (databases, namespaces, users, tasks, web apps).

## Coverage

Full SysAdmin API surface: processes (suspend/resume/terminate), databases & volumes,
namespaces & mappings, devices, locks, sessions, license, journal, ECP, work-queue
manager, DocDB, filesystem access — plus the complete security center (users, roles,
resources, services, permission matrix, audit, LDAP, SSL/TLS, encryption, web-auth,
MFT, SQL privileges, privileged routines), secrets (wallet, X.509, OAuth 2.0), task
management, web apps, and a built-in REST API explorer over the full OpenAPI spec.

## Install

    docker compose up -d        # IRIS + portal + MCP sidecar

or on an existing instance (IRIS 2026.2+):

    zpm "install iris-mission-control"

Then open http://localhost:52773/irisops/ and log in with your IRIS credentials.

## Security model

The portal shell serves unauthenticated so the React login page loads — real auth is
enforced by the `/api/admin` JWT layer. The cloud broker web app is separately
JWT-protected. Cloud credentials are resolved server-side through the IRIS wallet and
never exposed to the client.

MIT licensed. Contributions welcome.

## Form fields

| Field | Value |
|---|---|
| Name | IRIS Mission Control |
| Short description | tagline above |
| Repository | https://github.com/Fruitkwan/IRIS_Mission_Control |
| License | MIT |
| Version | 1.0.0 |
| Categories | Developer Tools / Administration & Monitoring |
| Install type | Docker (`docker compose up -d`) + ZPM module |

## Still needed before submitting

- [ ] Screenshots or demo GIF (dashboard, IRIS Doctor, FHIR, light/dark toggle)
- [ ] Open Exchange developer account login

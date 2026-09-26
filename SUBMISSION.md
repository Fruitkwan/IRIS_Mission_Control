# Open Exchange submission draft

Paste-ready listing text for the InterSystems Open Exchange submission form.

## App name

IRIS Mission Control

## Tagline / short description

Diagnose your InterSystems IRIS instance, see the evidence, and fix it safely —
a modern management portal on the /api/admin SysAdmin APIs, with an MCP server for AI agents.

## Full description

### What it is

IRIS Mission Control is a modern management portal for InterSystems IRIS, built on the
`/api/admin` SysAdmin APIs. At its center is **IRIS Doctor**, which answers the question
operators actually ask: *is my instance healthy, what needs attention, and how do I fix
it without breaking anything?*

### What makes it different

1. **Findings you can check.** 28 deterministic rules cover databases, journals, locks,
   security, audit, web apps, tasks, certificates and licensing. Every finding shows the
   raw evidence it is based on and links to the page where you act on it. Every rule has
   a test, and CI fails if a rule is added without one.
2. **Fixes you can trust.** Five findings can be fixed from the portal:
   - **Preview:** the exact before/after values, read from live IRIS.
   - **Confirm:** the configuration is re-read, and the fix is refused if anything
     changed since the preview.
   - **Apply and verify:** the change is confirmed with a fresh read.
   - **Audit:** a real IRIS audit record (`IrisOps/Remediation/Apply`) is written under
     the signed-in user.
   - **Undo:** restores the exact previous values.
3. **One engine, two interfaces.** An MCP server exposes 16 read-only tools that share
   the portal's rules engine. AI agents get the same evidence-backed findings as the UI,
   and every agent call is audited with secrets redacted.

### Also included

- **Operations Center:** a rule-based score for each subsystem and a findings feed
  ranked by severity.
- **Time Machine and Config Drift:** snapshots stored in IRIS and shared by all
  administrators, with before/after comparison of each fix.
- **FHIR Control Center:** endpoint discovery, CapabilityStatement visualizer,
  resource explorer and validator. A labeled synthetic demo server makes it work on
  Community Edition.
- **Cloud secrets broker:** Azure Key Vault checks run on the server. Secrets never
  reach the browser.
- **Unified log console, and universal search** (Ctrl+K) across pages and live entities.

### Community Idea implemented

[DPI-I-966 — Option to show older message.log in IRIS SMP](https://ideas.intersystems.com/ideas/DPI-I-966).
The **Messages Log** page lists `messages.log` and every rotated `messages.old_*`
file and shows any of them with severity filtering and search. It is read-only and
restricted to administrators, and no RDP to the server is needed.

### Coverage

The full SysAdmin API surface:
- processes, databases and volumes, namespaces and mappings
- devices, locks, sessions, license, journal
- ECP, work-queue manager, DocDB, filesystem access
- the security center: users, roles, resources, services, a permission matrix, audit,
  LDAP, SSL/TLS, encryption, web auth, MFT, SQL privileges, privileged routines
- secrets: wallet, X.509 and OAuth 2.0
- tasks and web applications
- a REST API explorer over the full OpenAPI spec

### Install

    git clone https://github.com/Fruitkwan/IRIS_Mission_Control.git irisops
    cd irisops && docker compose up -d --build

or, on an existing instance (IRIS 2026.2+):

    zpm "install iris-mission-control"

Then open http://localhost:52773/irisops/ and sign in with your IRIS credentials.

### Security model

- **Content-Security-Policy:** the portal only runs its own scripts and only connects
  to itself and the MCP server.
- **Portal shell:** it loads without authentication so the login page can appear.
  Every API call is authenticated by `/api/admin`.
- **Broker:** it keeps an HttpOnly, SameSite=Strict session instead of a
  browser-readable token. It requires the `%Admin_Secure` privilege and rejects
  cross-site requests.
- **Remediation:** each fix is an allow-listed change, and each one is audited in IRIS.
- **Cloud credentials:** resolved on the server through the IRIS wallet, and never sent
  to the browser.

Tested on InterSystems IRIS Community Edition 2026.2 (Build 221U). MIT licensed.

## Form fields

| Field | Value |
|---|---|
| Name | IRIS Mission Control |
| Short description | tagline above |
| Repository | https://github.com/Fruitkwan/IRIS_Mission_Control |
| License | MIT |
| Version | 1.0.0 (matches `module.xml`) |
| Package Manager | Enable the option to publish the app to the Package Manager (IPM/ZPM) registry. The package name is `iris-mission-control`. |
| Video | https://youtu.be/S-pdnruZOUE |
| Install type | Docker (`docker compose up -d --build`) and ZPM package |

## Checklist before submitting

Bonus points noted in brackets.

- [x] Docker [+2]
- [ ] ZPM package [+2]: publish to the Package Manager registry through Open Exchange.
  Afterwards, check that `zpm "install iris-mission-control"` works on a clean
  IRIS 2026.2.
- [x] YouTube video [+3]: https://youtu.be/S-pdnruZOUE (already in the README and
  article). Add it to the Open Exchange listing too.
- [ ] Online demo [+2]: add the public URL to the listing and the README. Don't leave
  the default `_SYSTEM`/`SYS` password on a public server.
- [ ] Developer Community article [+2], and a second article or translation [+1]
- [ ] First-time contribution [+3]: applies if this is your first Open Exchange contest
- [ ] Community Idea [+4]: DPI-I-966 is implemented. Name it in the listing and the
  article, with the link.
- [ ] Screenshots: `docs/images/` (regenerate from the new demo recording)
- [ ] Push to GitHub, and check that the CI badge is green

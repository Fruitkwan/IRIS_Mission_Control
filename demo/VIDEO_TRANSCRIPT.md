# IRIS Mission Control — voiceover transcript

Use with `VIDEO_SCRIPT.md`. Record the journal freeze-on-error workflow; do not
substitute the older login-auditing Supademo draft. Keep the recorded login,
credentials, wallet contents, and access tokens off screen.

## 0:00–0:20 — Opening

Every IRIS administrator asks the same question: is my instance healthy, and
what needs my attention right now? The classic Management Portal gives you
forty screens. IRIS Mission Control gives you an answer.

## 0:20–0:45 — Operations Center

The Operations Center scores each subsystem using deterministic rules against
live telemetry from the SysAdmin APIs. Every score is backed by findings, and
every finding by evidence.

## 0:45–1:10 — IRIS Doctor

IRIS Doctor runs a full diagnosis in seconds: databases, journals, locks,
security, audit, web applications, tasks, certificates and licensing.

## 1:10–1:40 — Evidence

Here's a real risk. Journal freeze-on-error is disabled, so if IRIS can't write
the journal, updates keep going without it. That can mean data loss after a
crash. The finding shows exactly what IRIS reported, not a guess.

## 1:40–2:20 — Safe remediation

Before anything changes, you see the exact field-level change, its scope, its
operational impact, and how to roll it back. When I confirm, IRIS Mission
Control re-reads the live configuration. If someone else changed it since the
preview, it refuses. Then it applies the change, verifies it with a fresh
read, and records it in the IRIS audit log under my username.

## 2:20–2:50 — Verification

Diagnosis again: the finding is gone and the score went up. The change history
comes from the IRIS audit log itself, and Time Machine shows the before and
after side by side.

## 2:50–3:20 — MCP

The same engine is available to AI agents over MCP. Claude, ChatGPT or your IDE
agent gets the same evidence-backed findings, and the freeze-on-error finding
is gone for them too. Every agent call is audited, with secrets redacted.

## 3:20–3:45 — Breadth

Five findings have safe fixes like this, and the Doctor links every other
finding to the page that fixes it. Underneath, it's a complete modern portal
on the official SysAdmin APIs, with a command palette, config drift, security,
FHIR and cloud secrets.

## 3:45–4:00 — Closing

IRIS Mission Control: diagnose, fix safely, and prove it. One `docker compose
up` and it's running. Links are below.

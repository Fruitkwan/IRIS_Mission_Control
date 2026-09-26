# IRIS Mission Control — demo video script (about 4 minutes)

One story, not a feature tour: **IRIS Doctor finds a real risk, shows the evidence,
previews the exact fix, applies it safely, proves it worked, records it in the IRIS
audit log, and an AI agent sees the same result.**

## Before recording

- Rebuild and start the stack: `docker compose up -d --build`. Wait for `irisops (healthy)`.
- Open http://localhost:52773/irisops/ and sign in **before** recording, so the password
  is never on screen.
- Browser at 1920×1080, zoom 100–110%, dark theme, one tab, no bookmarks bar.
- The default container has **journal freeze-on-error disabled**, which is the finding
  this video fixes. After each take, reset it: open the finding again → **Undo change** →
  **Confirm rollback**.
- For scene 7, have a terminal ready with the `curl` command below, or Claude Desktop
  connected to `http://localhost:3333/mcp`.

## Scenes

| # | Time | Screen (what to click) | Narration (voice-over) | On-screen caption |
|---|---|---|---|---|
| 1 | 0:00–0:20 | Title card, then the **Dashboard** with live charts moving. | "Every IRIS administrator asks the same question: is my instance healthy, and what needs my attention right now? The classic Management Portal gives you forty screens. IRIS Mission Control gives you an answer." | IRIS Mission Control — diagnose, fix safely, prove it |
| 2 | 0:20–0:45 | Sidebar → **Operations**. Pause on the per-subsystem scores and the severity-ranked findings. | "The Operations Center scores each subsystem using deterministic rules against live telemetry from the SysAdmin APIs. Every score is backed by findings, and every finding by evidence." | 28 tested rules · 19 live data sources |
| 3 | 0:45–1:10 | Sidebar → **IRIS Doctor** → click **Diagnose IRIS**. Let the progress list run, then show the score and the findings list. | "IRIS Doctor runs a full diagnosis in seconds: databases, journals, locks, security, audit, web applications, tasks, certificates and licensing." | One-click diagnosis |
| 4 | 1:10–1:40 | Find **Freeze-on-error is disabled** → click **View evidence**. Hover over the evidence rows and the recommendation. | "Here's a real risk. Journal freeze-on-error is disabled, so if IRIS can't write the journal, updates keep going without it. That can mean data loss after a crash. The finding shows exactly what IRIS reported, not a guess." | Evidence, not guesses |
| 5 | 1:40–2:20 | In the drawer, read the **Scope / Impact / Rollback** lines → click **Preview change** → show `FreezeOnError: false → true` → click **Confirm and enable journal freeze-on-error**. Wait for the green confirmation and "Recorded in the IRIS audit log". | "Before anything changes, you see the exact field-level change, its scope, its operational impact, and how to roll it back. When I confirm, IRIS Mission Control re-reads the live configuration. If someone else changed it since the preview, it refuses. Then it applies the change, verifies it with a fresh read, and records it in the IRIS audit log under my username." | Preview → confirm → verify → audit |
| 6 | 2:20–2:50 | Click **Run diagnostics and compare**. Show the finding gone, the higher score, and "Previous assessment: X/100 · Current: Y/100". Scroll to **Change history**. Click **View before/after in Time Machine →** and show the "What changed?" comparison. | "Diagnosis again: the finding is gone and the score went up. The change history comes from the IRIS audit log itself, and Time Machine shows the before and after side by side." | Verified resolution |
| 7 | 2:50–3:20 | Terminal: run the `curl` command below (or ask Claude Desktop: *"Check my IRIS instance and tell me what needs attention"*). Then sidebar → **MCP Server** → show the **Tool call audit** table. | "The same engine is available to AI agents over MCP. Claude, ChatGPT or your IDE agent gets the same evidence-backed findings, and the freeze-on-error finding is gone for them too. Every agent call is audited, with secrets redacted." | Same engine for humans and AI agents |
| 8 | 3:20–3:45 | Back in IRIS Doctor, open another fixable finding (for example a suspended task or an unauthenticated custom web app) and show its **Preview change**. Press **Ctrl+K** and search a page or entity. Quickly show **Config Drift** or **Security → Audit**. | "Five findings have safe fixes like this, and the Doctor links every other finding to the page that fixes it. Underneath, it's a complete modern portal on the official SysAdmin APIs, with a command palette, config drift, security, FHIR and cloud secrets." | Built on the /api/admin SysAdmin APIs |
| 9 | 3:45–4:00 | End card: GitHub URL, `docker compose up -d --build`, Open Exchange link. | "IRIS Mission Control: diagnose, fix safely, and prove it. One `docker compose up` and it's running. Links are below." | github.com/Fruitkwan/IRIS_Mission_Control |

### Scene 7 command

```bash
curl -s -X POST http://localhost:3333/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"iris_get_health","arguments":{}}}'
```

## Optional proof shot (10 seconds, after scene 6)

In the classic Management Portal: **System Administration → Security → Auditing → View
Audit Database**. Filter on event source `IrisOps` to show the `IrisOps/Remediation/Apply`
record. IRIS takes about 35 seconds to show a new audit record, so record this shot a
minute after the fix.

## What to avoid

- Don't tour every menu. Judges remember one clear story.
- Don't show the password or the login form.
- Don't claim the scores are InterSystems health metrics. They are IRIS Mission Control's
  rule-based assessment.
- Keep it under 5 minutes.

## Prompt to give ChatGPT

> I'm making a 4-minute demo video for an InterSystems IRIS programming contest. The app
> is IRIS Mission Control, a management portal with an "IRIS Doctor" that diagnoses an IRIS
> instance, previews a safe fix, applies it, verifies it, and records it in the IRIS audit
> log. I have recorded the screen following the script below. Please:
> 1. Polish the narration for each scene so it sounds natural when spoken, keeping each
>    scene within its time range and keeping every technical claim unchanged.
> 2. Write SRT subtitles that match the scene timings.
> 3. Write a YouTube title, a description with chapters (timestamps from the table),
>    and 10 tags.
>
> [paste the Scenes table here]

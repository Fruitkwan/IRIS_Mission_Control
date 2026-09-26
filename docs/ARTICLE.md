# IRIS Mission Control: diagnose your IRIS instance, fix it safely, and prove it

*Tags: #Management Portal, #REST API, #Contest, #Open Exchange*

Every IRIS administrator eventually asks the same question: **is my instance healthy,
and what needs my attention right now?** The classic Management Portal can answer
it, but only after you visit a dozen pages and put the pieces together yourself.

For the *Build Your Own Management Portal* contest I built **IRIS Mission Control**, a
modern portal on the new `/api/admin` SysAdmin APIs (IRIS 2026.2+). It covers the
full API surface, but this article is about the part I care most about:
**IRIS Doctor**, which goes from diagnosis to a safe, verified, audited fix.

- GitHub: https://github.com/Fruitkwan/IRIS_Mission_Control
- Open Exchange: *(link)*
- Video: *(link)*

## One-click diagnosis, with evidence

IRIS Doctor reads live telemetry from 19 SysAdmin endpoints and runs **28
deterministic rules**:
- databases (mount state, read-only, space)
- journal (space, freeze-on-error, compression)
- lock table, serious alerts, backups
- services and web applications without authentication
- default accounts, login auditing
- suspended and failing tasks
- certificate expiry, license saturation, runaway processes

Every finding carries:
- the **raw evidence** it is based on (the actual values IRIS returned)
- a severity and category
- a recommendation
- a deep link to the page where you act on it

The score is openly a prioritization aid, *not* an InterSystems health metric: one
fixed penalty per distinct finding type, averaged over seven categories. If a data
source can't be read, the report says the assessment is incomplete rather than
showing a falsely perfect score.

Every rule has a unit test covering its trigger, severity, category, evidence and
deep link. A meta-test parses the rules file and fails CI if a rule is added
without a test case.

## From diagnosis to a fix you can trust

Showing a problem is easy. Changing a production setting from a web page is where
trust matters. Five findings can be fixed from the finding drawer:
- login auditing disabled
- an unauthenticated custom web application
- journal freeze-on-error disabled
- a suspended task
- an expiring or expired certificate (a guided fix)

Each automatic fix follows the same steps:

1. **Preview.** It reads the live configuration and shows the exact field-level
   change, for example `FreezeOnError: false → true`. It also shows the scope ("only
   this field"), the operational impact and how to roll back.
2. **Confirm.** Before writing, it reads the configuration **again**. If anything
   changed since the preview (another administrator, another tool), the fix is
   refused.
3. **Apply and verify.** After writing, a **fresh read** must show the change.
   "IRIS returned 200" is not treated as success.
4. **Audit.** It writes a real IRIS audit record, `IrisOps/Remediation/Apply`, under
   the signed-in user, with the before/after values.
5. **Undo.** It restores the exact previous values, but only if nothing else changed
   the resource in the meantime.

The fixes are deliberately narrow. The web-app fix clears only the `Unauthenticated`
bit (`AutheEnabled` 64) and keeps every other authentication method. The journal fix
sends every other journal setting back unchanged. Both were verified against a live
instance by diffing the complete configuration record before and after.

## Proving it worked

After a fix, **Run diagnostics and compare** re-runs IRIS Doctor. The finding is
gone, the score rises, and the page shows the previous and current score.
**Time Machine** opens with the before/after snapshots already selected. Snapshots
are stored in IRIS (not in the browser), so every administrator sees the same
history.

The same health engine is exposed over **MCP** (Model Context Protocol). An MCP
server with 16 read-only tools shares the portal's collectors and rules. So when
Claude, ChatGPT or an IDE agent asks "is my IRIS healthy?", it gets the same
evidence-backed findings you see in the UI. Every tool call is audited, with
secret-looking arguments redacted.

## A Community Idea: reading older messages.log files

[DPI-I-966](https://ideas.intersystems.com/ideas/DPI-I-966) asks for a way to view
`messages.old_*` files from the portal. Today, after a log switch (for example one
forced by mirror problems), you need access to the server itself to read them.

IRIS Mission Control's **Messages Log** page lists `messages.log` and every rotated
`messages.old_*` file. It shows the last lines of any of them, with severity
highlighting and search. It is read-only and requires `%Admin_Operate` or
`%Admin_Manage`, and the server accepts only those file names. IRIS Doctor's "serious
system alert" finding links straight to it.

## Lessons from building on the SysAdmin APIs

A few things I learned that may save you time:

- **Web application authentication is a bitmask.** `AutheEnabled` 96 means password
  (32) plus unauthenticated (64). Clearing 64 is the precise "require login" change.
- **`GET /v2/task` does not include the `Suspended` flag.** The task list
  (`/v2/tasks`) does, so read it from there.
- **Changing audit event definitions invalidated JWTs for my own REST application.**
  Tokens issued by `/api/admin` kept working, but tokens for a separate CSP
  application with `JWTAuthEnabled` were rejected (401) after any audit event
  create/modify, including through the SysAdmin API. Since one of my fixes changes an
  audit event, the audit write that followed failed. I switched that application to
  a CSP session in an **HttpOnly, SameSite=Strict** cookie. It survives these
  changes, and the browser holds one less token.
- **New audit records take time to appear in SQL.** `$SYSTEM.Security.Audit()`
  returns success immediately, but the row only showed up in `%SYS.Audit` about 35
  seconds later in my tests. The UI therefore shows a "recorded, appearing shortly"
  state and polls until the record appears.
- **The Content-Security-Policy is straightforward.** The built bundle uses no `eval`,
  so `script-src 'self'` works. I moved the one inline script into a file, and the
  policy blocks injected scripts, inline event handlers and exfiltration to other
  domains.

## Try it

```bash
git clone https://github.com/Fruitkwan/IRIS_Mission_Control.git irisops
cd irisops
docker compose up -d --build
```

Open http://localhost:52773/irisops/, sign in as `_SYSTEM`/`SYS`, go to **IRIS
Doctor**, click **Diagnose IRIS**, and fix "Freeze-on-error is disabled".

On an existing IRIS 2026.2+ instance:

```
zpm "install iris-mission-control"
```

The project has 86 unit tests, and CI runs lint, tests and the build, boots the MCP
server, and starts the full Docker stack. I'd love your feedback. If you like it,
please vote in the contest!

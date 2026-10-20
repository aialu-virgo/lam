---
title: Hosting on Virgo Google Cloud
summary: One stack (Cloud Run + Firestore + own email/password login, server-side scoping) to host the Desk on Virgo's Google Cloud, with cost, IT asks, deploy and cut-over steps, build hours and test plan.
status: draft
updated: 2026-10-21
related:
  - design/architecture.md
  - decisions.md
  - design/_index.md
  - design/role-matrix.md
  - design/wireframes/login.html
  - design/wireframes.md
  - design/brief-part-b.md
  - .claude/rules/data-handling.md
  - .claude/rules/boundaries.md
---

# Hosting on Virgo Google Cloud
**Owner:** Full-Stack Engineer · **Decision:** [Decisions](../decisions.md) D24 · **Approval:** not submitted (Vijay first, then SP Sir FYI)
**Problem:** most users have no claude.ai account, so the claude.ai link cannot reach them.
**Constraint:** the page (`build/desk/src`, v1.0) already works and passed 12 checks; the move must be "a source change, not a redesign" ([Architecture](architecture.md)).
**Recommendation:** Cloud Run + Firestore in `asia-south1`, behind a load balancer on `desk.virgoasia.com`, with a small adapter that gives the page the same `db` and `user` interface over a REST API. Details below.
**Next action:** Vijay approves; Virgo IT supplies the items in "What Virgo IT must provide".

**Verified vs assumed.** Verified: the repo files cited here, the page's boot code (`claude.use('user' | 'downloads' | 'db')`, `collection().onSnapshot / get`, `doc().get / set / delete`, `add`), and that [Role matrix](role-matrix.md) scope is applied in the page today. **Assumed, not checked against Google's current price list or docs:** every price, quota and product limit marked "est." or "check". Virgo IT confirms them with the Google pricing calculator before sign-off.

## 1. The stack (one choice each)
| Part | Choice | Trade-off in one line |
|---|---|---|
| Compute | **Cloud Run**, one service, Node.js 22, `asia-south1`, min 1 instance, 1 vCPU, 1 GiB | Always-on instance costs about US$10 a month but avoids 3 to 6 s cold starts on the login hash; scale-to-zero is cheaper and slower. |
| Database | **Firestore (native mode)**, region `asia-south1` | Same document/collection model as today so doc ids and collections carry over; no ad-hoc SQL (add a BigQuery export later if wanted). |
| Login | **Own email + password**, argon2id, server-side sessions in Firestore, httpOnly cookie | We own the security code (about 18 h to build and test); managed Identity Platform was rejected because forced-change, lockout count and admin reset to a Secret Manager value need custom code anyway (assumed, not checked). |
| Edge | **Global external Application Load Balancer** + Google-managed certificate | About US$20 a month, but gives HTTPS, a fixed IP, HTTP to HTTPS redirect and rate-limit options; Cloud Run domain mapping is simpler but not suited to production. |
| Secrets | **Secret Manager** | Free at this size; the deploy must be allowed to read three secrets. |
| Build / deploy | **Cloud Build** from Artifact Registry image, triggered from the Virgo repo | The deploy credential never leaves Google Cloud; needs IT to link the repo once. |

### Why Firestore, not Cloud SQL
- The page stores documents in collections (about 250 today, 25,000 cap, 100 MB). The 12-quarter plan is about 1,500 `inv` chunk docs and 60 to 90 MB ([Architecture](architecture.md)), all under 256 KiB each; Firestore allows 1 MiB.
- Doc ids and collection names move over unchanged, so the one-time migration is a copy, not a re-model, and the adapter is a thin layer.
- Cost at this size: storage under US$0.20 a month; reads about US$0.04 per 100,000 (est.), so 300 users cost a few dollars. Cloud SQL would start near US$10 to 30 a month for the smallest instance plus patching and a schema rewrite.
- The heavy data is gzip blobs read by id, which suits a document store. Revisit SQL only if line-level storage returns (a decision for SP Sir, not part of this move).

## 2. The adapter: same interface, REST underneath
- A script `desk-adapter.js` (built into `dist/index.html` for the hosted build only) defines `window.claude.use(name)` and returns:
  - `user`: `me()`, `email()`, `isOwner()`, `id()` from `GET /api/me` (`isOwner` = Super admin). 401 shows the login screen ([wireframe](wireframes/login.html)).
  - `downloads`: browser Blob download (the page already uses this for exports).
  - `db`: `collection(name)` with `get()`, `onSnapshot(ok, err)`, `add()`; `doc(id)` with `get/set/delete`; the same snapshot shape (`dataOf`, `_id`) and the same error codes (`quota_exceeded`, `resource_exhausted`) so existing handlers still work.
- `onSnapshot` is polling: `GET /api/db/{collection}?since={rev}` every 30 s while the tab is visible, and straight after the page's own writes. Trade-off: other people's changes appear within 30 s, not instantly. No websockets to run.
- Writes carry the document `_rev` (Firestore update time) as `If-Match`; on 409 the adapter re-reads and retries once, then the page shows its existing error text. This protects action threads, which are arrays inside one document.
- Screens, rules engine, intake and check rules do not change. The `PAGE_URL` constant and the cdnjs SheetJS tag change (below).
- **One contract test:** the existing `build/desk/test/mock-claude.js` is the specification; the 28-test suite runs once against the mock and once against the adapter + local API on the Firestore emulator.

## 3. Authentication
| Topic | Design |
|---|---|
| Identity | Email (lower-case) must match an **active** user in the `users` master. No match, or `active = N`: same message as a wrong password. |
| Hashing | **argon2id**, memory 19 MiB, 2 iterations, 1 lane (OWASP minimum, check), per-user salt, plus a server **pepper** from Secret Manager. Trade-off vs bcrypt: stronger against GPUs, needs a native module (supported on Cloud Run). Stored in `authUsers/{email}`, a collection **never exposed by the db API**. |
| Initial password | Supplied at deploy as Secret Manager secret `desk-initial-password` (version `latest`). The bootstrap job and "Reset password" read it at runtime, hash it per user, set `must_change = true`. It is never in the repo, an image, an environment variable file, logs or the page; the admin never sees or types it. |
| Forced change | While `must_change`, the session may call only `POST /api/auth/change-password` and logout; every `/api/db` call returns 403 `password_change_required`. The screen asks for the starting password, a new one and a confirmation ([wireframe](wireframes/login.html), screen 2). |
| Password rules | At least 12 characters, at most 128; not equal to email or name; not in a bundled list of 10,000 common passwords; not equal to the last 3. No forced mixing of character types (NIST 800-63B). |
| Session | Random 256-bit token; only its hash is stored in `sessions/{hash}`. Cookie `__Host-desk`: `HttpOnly; Secure; SameSite=Lax; Path=/`. Idle timeout 4 h, absolute 12 h (assumption, Q4). Logout and password change delete all of that user's sessions. Each request re-checks `active` (cached 60 s), so making a user inactive ends access within a minute. |
| CSRF | SameSite=Lax, plus every write must carry header `X-Desk: 1` and an `Origin` equal to the Desk host; otherwise 403. |
| Lockout | 5 wrong passwords in a row lock the account for **30 minutes** (auto-unlock); a Super admin can unlock sooner. Also 20 attempts per IP per 15 min (Cloud Armor or in-app). The sign-in answer is identical for unknown email, wrong password and inactive user. Trade-off: someone can lock a colleague out for 30 minutes; the unlock button is one click. |
| Admin reset | Super admin, Admin › Users: **Reset password**, **Unlock**, **Make inactive**, shown with a sign-in status column ([wireframe](wireframes/login.html), screen 3). Reset sets the starting password, sets `must_change`, ends sessions. Each use is written to `audit`. No email is sent (no auto-send, no mail service to buy). |
| Starting-password expiry | A starting password unused for 7 days stops working until reset (recommended, Q2). |
| Inactive users | Cannot sign in; sessions die within a minute; their open actions follow the existing reassignment flow. |
| Optional later | "Sign in with Google" for `@virgoasia.com` (OIDC, hosted-domain check). The email must still be an active Desk user, so authorization is unchanged. Not in this build. |

## 4. Server-side authorization (before any data leaves)
**Principle:** the browser never receives a document, or a row inside one, outside the viewer's scope. The page's own filters stay as a second layer.

**Where the rules live.** One module `scope.js`, written once from [Role matrix](role-matrix.md) and the page's existing scope code (same JavaScript, so figures match), used by the API only. A table `collection × role → read filter, write rule` is the single source and is what the tests walk.

**Reads.** Every `GET /api/db/...` resolves the session to a user, applies the user's scope, and returns only that result:
| Data | How a read is scoped |
|---|---|
| `inv`, `roll`, `cells`, open-item stores (`orders`, `deliveries`, `receivables`, `collections`, `stock`) | Server adds indexed fields `_plant` and `_month` on write/migration. Plant-limited roles (Branch, Coordinator, Accounts, Plant) get only docs whose `_plant` is in `plant_codes`. Super admin, Management, HOD (department rule) get all. |
| Aggregate blobs for a **Sales executive** | The server decodes the gzip+base64 rows, keeps rows where `salesperson = sales_employee_code` or the customer's master salesperson is the user, re-encodes in the same format, and returns that. Decoded-and-filtered blobs are cached per document `_rev` and scope key. Document-index rows are filtered by customer and plant with the "Documents of your customers" note (Role matrix D9 / O-R1; if O-R1 is accepted, filter by salesperson exactly). |
| Coordinator Sales view | Server strips target, potential and scorecard fields (collections `potential`, `settings` scorecard parts are not returned). |
| `users` | Non-admin: own record plus name, email, role, department, plants of people they may assign to or see in their scope. Never `authUsers`, `sessions`, or another person's mobile unless the Role matrix allows. Super admin: all. |
| `actions`, `followups`, `log` | Owner, assigner, or within scope (branch plants; department for HOD); all for Management and Super admin. |
| `potential`, `periods`, `planlocks`, `settings`, `audit`, `mappings`, `uploads`, `rejects` | Per collection table in the build; `audit`, `mappings`, `uploads`, `rejects` Super admin only. |
| "View as" | Super admin only: header `X-View-As: email`; the server applies that user's scope, rejects all writes, and logs the preview. |

The rules engine and escalation ladder keep running in the browser for Super admin, Management and HOD, who already hold the whole scope ([Architecture](architecture.md)). Moving them to a scheduled job is possible later and is not needed for the cut-over.

**Writes.** Each write is checked on the server, and the server (not the page) writes the audit entry in the same Firestore transaction.
- **Super-admin-only collections** (D21 list: `periods, audit, settings, users, plants, cells, inv, roll, mappings, transfers, uploads, rejects, items, itemmeta, salesmaster, phasing`, open-item stores): any other role gets 403. This replaces the claude.ai "Editor sharing" rule.
- **Shared collections** (`potential, actions, followups, log, planlocks`): allowed per capability grid. Approving a revision requires Management, Super admin or HOD (P2, P4, P5) and approver email not equal to proposer. A Done response needs a closure note. Actions can be written only for the user's own scope. `planlocks` Management or Super admin only.
- **Closed quarter:** a write to `inv`, `roll` or `cells` whose `_month` lies in a closed `period` needs Super admin, a `reason` field, and an `audit` entry created by the server in the same transaction; otherwise 403 `period_closed`.
- **Locked quarter:** `potential` and plan writes for a locked quarter (`periods` locked or `planlocks`) return 403 `quarter_locked`; there is no unlock path.
- **Shape checks:** document id pattern per collection, body at most 256 KiB, depth at most 32, `_plant` in the plant master, unknown fields stripped for server-owned names (`_rev`, `_plant`, `_month`).
- **Never writable by the API:** `authUsers`, `sessions`.

## 5. Uploads
SAP files are parsed **in the browser** exactly as now (raw rows never leave the user's computer); the browser sends only the aggregate chunks, roll-ups, coverage and upload records.
- Super admin only. `POST /api/db/batch`, at most 400 operations and 4 MiB per request (Cloud Run allows more; this keeps memory low), each document at most 256 KiB.
- A plant-month reload is one batch plus deletes of stale chunks, as today. A 36-month load is about 1,500 chunk documents: about 5 to 8 requests per month of data.
- The page keeps its "Keep the document index" option and shows live usage; Firestore has no 25,000 cap, but the page keeps its own warning at 20,000 documents or 400 MB (assumed thresholds).
- SheetJS is **vendored into the Desk build** (not loaded from cdnjs) so the page can set `script-src 'self'`. Content Security Policy and `Cache-Control: no-store` on `/api` are set by the server.

## 6. Secrets, logging, audit, backups
- **Secret Manager:** `desk-initial-password`, `desk-pepper`, `desk-session-key`. Runtime service account has `secretAccessor` on these three only. No secret in code, image, repo or logs.
- **Logging:** structured JSON to Cloud Logging, 90-day retention (est. free within the monthly allowance). Logged: sign-in success and failure (email hash, IP, no password), lockout, reset, unlock, change, role or `active` change, 403s, closed-quarter writes, view-as. Never logged: passwords, cookies, request bodies.
- **Audit:** the existing `audit` collection (permanent, Super admin read) gets the server-written entries; the integrity check in [Architecture](architecture.md) keeps working. Google Cloud Audit Logs (admin activity) stay on.
- **Backups:** Firestore **point-in-time recovery (7 days)** plus a **daily scheduled backup kept 35 days**. Trade-off: a deleted collection older than 35 days is gone; add a monthly export to a Virgo bucket if IT wants longer. Restore drill once before go-live.
- **Alerts:** Cloud Monitoring on 5xx rate, login-failure spike, and Cloud Run instance count; email to Vijay and IT.

## 7. Rough monthly cost at about 300 users
All est. at 1 US$ about ₹85; confirm in the calculator.
| Item | US$ / month |
|---|---|
| Cloud Run (1 vCPU, 1 GiB, 1 min instance, light traffic) | 10 to 20 |
| External load balancer (forwarding rule + processing) | 18 to 25 |
| Firestore (under 1 GiB; about 3 to 10 M reads, under 1 M writes; PITR + backups) | 2 to 8 |
| Secret Manager, Artifact Registry, Cloud Build, logging, monitoring | 1 to 5 |
| **Total** | **about 35 to 60 (₹3,000 to 5,000)** |
Nothing here uses an LLM. No paid tool beyond the Google Cloud project's own billing; Virgo IT approves the billing account ([Boundaries](../.claude/rules/boundaries.md): no spend without a Principal's OK).

## 8. Domain and HTTPS
`desk.virgoasia.com` -> reserved global static IP -> HTTPS load balancer -> serverless NEG -> Cloud Run (ingress "internal and Cloud Load Balancing"). Google-managed certificate; HTTP redirects to HTTPS; HSTS 1 year; TLS 1.2 minimum. IT adds one DNS A record (and AAAA if IPv6 is reserved). Certificate takes up to about an hour after DNS resolves.

## 9. What Virgo IT must provide
| # | Item | Notes |
|---|---|---|
| 1 | **Project id** | New project, suggested `virgo-lam-desk`, inside the Virgo organization. |
| 2 | **Billing** | Billing account linked to the project; budget alert at US$75. |
| 3 | **Region** | `asia-south1` (Mumbai) for Cloud Run, Firestore and backups. |
| 4 | **Domain** | `desk.virgoasia.com`, and someone who can add the DNS A record. |
| 5 | **Org policy exemption** | Cloud Run must accept public (`allUsers`) invoke for this one service because login is in the app; if "domain restricted sharing" blocks it, exempt this project. |
| 6 | **One-time setup by IT** (script supplied, IT reads it first): enable APIs (run, firestore, secretmanager, cloudbuild, artifactregistry, compute, monitoring); create Firestore database; create the 3 secrets (IT or Vijay enters the initial-password value in the Cloud console, not in chat); runtime service account `desk-run@`; load balancer and certificate. | Needs a person with Owner on the project for about 1 hour. |
| 7 | **Deploy service account** `desk-deploy@` with only: Cloud Run Developer, Artifact Registry Writer, Cloud Build Editor, Service Account User (on `desk-run@` only). | No Owner, no Secret Manager read. |
| 8 | **Runtime service account** `desk-run@`: Cloud Datastore User, Secret Manager Secret Accessor (the 3 secrets), Logs Writer. | |
| 9 | **Repo link** | Connect the Virgo GitHub repository to Cloud Build (one trigger on tag `desk-v*`). |
| 10 | **Named contacts** | Who on IT answers within a working day during build and cut-over. |

**How the deploy credential reaches this environment: it does not.** Preferred path: a Cloud Build trigger inside the Virgo project builds and deploys when a tag is pushed, so no key leaves Google Cloud. If IT would rather deploy by hand, they run the same `cloudbuild.yaml` or the commands in section 10 from Cloud Shell. If a credential must reach this environment, it is a short-lived impersonation grant or Workload Identity, never a JSON key; the value is entered by Vijay in the environment's secret settings (not in chat, not in the repo), each use is asked first, and it is revoked after cut-over. Network access from this environment to `*.googleapis.com` may need allow-listing (not checked).

## 10. Deploy steps (placeholders in `<>`; run by IT or Cloud Build)
```
# one time, by IT with Owner
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com firestore.googleapis.com secretmanager.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com compute.googleapis.com monitoring.googleapis.com
gcloud firestore databases create --location=asia-south1 --type=firestore-native
gcloud firestore databases update --enable-pitr
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=35d
gcloud artifacts repositories create desk --repository-format=docker --location=asia-south1
gcloud iam service-accounts create desk-run
# secrets: values typed in the console or piped from a prompt, never echoed or committed
gcloud secrets create desk-initial-password --replication-policy=automatic
gcloud secrets create desk-pepper --replication-policy=automatic
gcloud secrets create desk-session-key --replication-policy=automatic

# each release (Cloud Build runs this on tag desk-v*)
gcloud builds submit --tag asia-south1-docker.pkg.dev/<PROJECT_ID>/desk/desk:<TAG>
gcloud run deploy desk --image asia-south1-docker.pkg.dev/<PROJECT_ID>/desk/desk:<TAG> \
  --region asia-south1 --service-account desk-run@<PROJECT_ID>.iam.gserviceaccount.com \
  --min-instances 1 --max-instances 5 --cpu 1 --memory 1Gi --concurrency 40 \
  --ingress internal-and-cloud-load-balancing --allow-unauthenticated \
  --set-secrets INITIAL_PASSWORD=desk-initial-password:latest,PEPPER=desk-pepper:latest,SESSION_KEY=desk-session-key:latest

# load balancer + certificate (one time)
gcloud compute addresses create desk-ip --global
gcloud compute network-endpoint-groups create desk-neg --region asia-south1 \
  --network-endpoint-type serverless --cloud-run-service desk
gcloud compute backend-services create desk-be --global --load-balancing-scheme EXTERNAL_MANAGED
gcloud compute backend-services add-backend desk-be --global --network-endpoint-group desk-neg \
  --network-endpoint-group-region asia-south1
gcloud compute url-maps create desk-map --default-service desk-be
gcloud compute ssl-certificates create desk-cert --domains desk.virgoasia.com --global
gcloud compute target-https-proxies create desk-proxy --url-map desk-map --ssl-certificates desk-cert
gcloud compute forwarding-rules create desk-https --global --address desk-ip --target-https-proxy desk-proxy --ports 443
# plus a port-80 redirect url-map; then IT adds DNS A desk.virgoasia.com -> desk-ip
```
`INITIAL_PASSWORD` mounts as a Secret Manager reference; the app reads it only inside the bootstrap and reset code paths and never logs it. A staging copy (`desk-stg`, a named Firestore database `stg`, demo data only) is deployed first with the same commands.

## 11. Migration and cut-over from the claude.ai link
**Data path (recommended):** the data does not pass through this build environment.
1. Add **Admin › Tools › Export database** to the claude.ai v1.0 page (a small change: it downloads one JSON file of every collection to the Super admin's computer). The file is Virgo data, so it stays on Virgo machines and is never put in the repo.
2. In the hosted Desk, **Admin › Tools › Import database** (Super admin, only while the database is empty or in "migration mode") reads that file in the browser and posts it in batches of at most 4 MiB. The server writes each document under the **same collection and doc id**, fills `_plant` and `_month` from the ids, and keeps every page-visible field unchanged.
3. **Verification report:** per collection, document count and total bytes in the file vs in Firestore, plus a SHA-256 over each document's canonical JSON; the import fails visibly on any difference. Expected today: about 250 documents.
4. Users are imported with their role and plants; `bootstrap` creates a credential record for every active user with `must_change = true`.

| When | Step | Who |
|---|---|---|
| Before go-live | Staging with demo data: run the 12 checks and the security tests (section 14). | Engineering QA (not the builder) |
| T-3 days | Dry-run import of a real export into **staging**; compare report; users sign in with starting password in a pilot of 5 (one per role). | Vijay, Full-Stack Engineer |
| T-1 day | Send users a Delivery-Lead-drafted message with the new link; a Principal approves it and sends it (no auto-send). | Delivery Lead, Vijay |
| T-0 | Ask users to stop writing; Super admin exports; import to production; report matches; 5-person smoke test with each role. | Vijay, QA |
| T-0 + 1 h | Open the link. The claude.ai page is republished with a banner "Moved to desk.virgoasia.com" and its sharing set to the Principals only. | Delivery Lead |
| T+14 days | If no issue, the claude.ai artifact stops being used. Deleting it needs a Principal's OK. | Vijay |

**Rollback:** until T+14 the claude.ai database is untouched. Changes made on Google Cloud after T-0 would be lost on rollback, so rollback uses **Export database** from the hosted Desk and the reverse import (the same tool, built once).
**Open writes during the freeze:** about 15 to 30 minutes at T-0; the only daily-changing collections are `actions`, `followups`, `log`, `audit`.
Record the new link, tag and decision in [Decisions](../decisions.md) when published.

## 12. Data-handling checks
- No Virgo data in the repo or image: `.gitignore` keeps exports out; Firestore holds data only in Virgo's project. The demo generator is the only data source in staging.
- SAP stays read-only; no connection to SAP exists in this design.
- No LLM calls; no outbound mail; the server has no mail library and no outbound calls (checked by a dependency scan in CI). Follow-ups remain drafts that a person sends.
- Text in uploaded files is data; the server never evaluates it.

## 13. Build estimate (hours of work)
| Part | Hours |
|---|---|
| Adapter (`user`, `downloads`, `db`, polling, `_rev`, error codes) + contract tests | 14 |
| API and Firestore layer (CRUD, batch, validation, `_plant`/`_month`, conflicts) | 16 |
| Authentication (argon2id, sessions, forced change, lockout, reset, login screens) | 18 |
| Authorization (`scope.js`, per-collection read/write table, blob re-filtering and cache, closed/locked, view-as) | 28 |
| Admin screens (sign-in status, reset, unlock, inactive) | 6 |
| Export / import / verify report | 10 |
| Infra (Dockerfile, Cloud Build, setup script, load balancer, backups, alerts, staging) | 12 |
| Logging and audit | 4 |
| Test: authorization matrix, security, the 12 checks on staging, load test at 300 users | 20 |
| Runbook and handover | 6 |
| **Subtotal** | **134** |
| Contingency 20% | 27 |
| **Total** | **about 160** |
The largest risk is the Sales-executive blob re-filtering (parity with the page's figures); it is built and tested first.

## 14. Test plan, mapped to the 12 acceptance checks
Run on staging by Engineering QA, never by the builder. Pass means the check passes through the hosted build, with the response bodies inspected, not only the screen.
| # | Check ([Brief Part B](brief-part-b.md) §8) | Hosted-build test |
|---|---|---|
| 1 | Each role sees only its scope | For every role in the [Role matrix](role-matrix.md) fixture, call every collection endpoint and assert from the raw responses: totals 1,300 / 600 / 250 and no plant B or C document for `bm.a`; `stranger@demo` gets nothing. Search the response bytes for K3, K4 names. |
| 2 | Today never exceeds cap | Cap test (12 actions, caps 3, 5, 20) through the adapter. |
| 3 | Plan vs actual and drill to documents | Drill from a figure to the document index through the API for an in-scope viewer. |
| 4 | B1 and S/4 give identical numbers | Load both files via the hosted intake; compare the figures. |
| 5 | Overdue actions give L1 to L3 drafts; no auto-send | Fake-clock run; dependency scan shows no mail or outbound HTTP code on the server. |
| 6 | Responses in thread and log; Done needs a note | API rejects Done without a note; two simultaneous responses both survive (`_rev` retry). |
| 7 | Layout at 360 / 768 / 1440, light and dark | Screenshots of the page and the four login screens at each size. |
| 8 | No real Virgo data in repo or page source | Secret and data scan on repo and image; unauthenticated `GET /` returns the page with no data; `GET /api/db/*` returns 401. |
| 9 | Growth QoQ only | The existing QoQ tests (including Q1 to prior-Q4 crossover) run through the adapter. |
| 10 | Closed quarters need Super admin; coverage flags gaps | Non-admin write to a closed-quarter `inv` doc gives 403; Super admin without `reason` gives 403; with reason succeeds and the server writes `audit`. |
| 11 | Target = potential × share; revisions; locked quarter | Revision approval by proposer is rejected; write to a locked quarter gives 403 `quarter_locked`. |
| 12 | 12-quarter trend and Stretch match hand calculation | Run on demo data through the adapter. |
| New A | Login | Wrong password x5 locks 30 min; unknown email and wrong password answer identically; starting password forces change and blocks `/api/db`; expired starting password; inactive user loses access within 60 s. |
| New B | Session and web | Cookie flags `HttpOnly; Secure; SameSite=Lax; __Host-`; CSRF header and Origin enforced; logout ends the session; no password, cookie or body in logs. |
| New C | Migration | Import report matches in counts and hashes; doc ids and collections identical; re-import is idempotent. |
| New D | Operations | Restore drill from PITR; load test at 300 users; alert fires on a forced 5xx. |

## Open questions (each with a recommendation)
| # | To | Question | Recommendation |
|---|---|---|---|
| Q1 | Vijay | Project id, billing, region, domain: who at Virgo IT? | New project `virgo-lam-desk`, `asia-south1`, `desk.virgoasia.com`. |
| Q2 | Vijay | One shared starting password means anyone who knows it can enter an account nobody has opened yet. | Keep D24, expire an unchanged starting password after 7 days, rotate the secret after the first week, and tell users to change it on day one. Per-user starting passwords need a delivery channel Virgo has not approved. |
| Q3 | Vijay | Deploy credential route? | Cloud Build trigger in Virgo's project; no credential here. |
| Q4 | Vijay | Session length. | Idle 4 h, absolute 12 h. |
| Q5 | Vijay | Always-on instance (about US$10 a month)? | Yes, for fast sign-in. |
| Q6 | SP Sir | O-R1: add `salesperson` to the document index so a Sales executive's documents match the figure. | Yes, before the migration, as already recommended in [Role matrix](role-matrix.md). |
| Q7 | Vijay | Google sign-in for `@virgoasia.com`? | Later, after launch; adds no new access. |

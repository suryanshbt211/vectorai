# Vector Platform

Private AI for organizations: run open models (Gemma by default) on your own hardware through Ollama, with role-based access, a tamper-evident audit ledger, and a compliance workspace that adapts to the customer's industry and jurisdictions.

Zero dependencies. Node 20.3 or newer. Nothing is loaded from the internet at runtime.

## Quick start

```bash
# 1. Ollama (https://ollama.com), on the same machine or another one
ollama serve

# 2. Vector
npm start
```

The first start prints the `operator` password once. Open http://127.0.0.1:8080/app/ and sign in.

- Public site: `/`  ·  Product: `/app/`
- Try it with sample data: `npm run seed-demo` (creates "Demo Logistics Co" with one user per role; the password is printed, or set `DEMO_PASSWORD`).
- No GPU or Ollama handy: `npm run mock-ollama` starts a fake Ollama so you can click through every screen. It does no real inference.

### Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` / `HOST` | 8080 / 127.0.0.1 | Listen address. Put a TLS reverse proxy in front before exposing it. |
| `OLLAMA_HOST` | http://127.0.0.1:11434 | The Ollama this server manages |
| `VECTOR_DATA_DIR` | ./data | Users, deployments, ledgers, evidence files |
| `VECTOR_OPERATOR_PASSWORD` | generated | Initial password for the `operator` account |
| `VECTOR_NVIDIA_SMI` | nvidia-smi | Path to the GPU query tool |

## First run as a customer

1. Sign in as `operator`, open **Customers**, create the organization. Choose its industry and every place it operates. The owner gets a temporary password.
2. Sign in as the owner. **Models**: download Gemma 3 4B (one click) or any other tag.
3. **Deployments**: create one, choose GPU use (automatic, maximum, CPU only), context length and keep-alive. Start it.
4. **Assistant**: chat. Add department documents in **Knowledge** and answers cite them.
5. **Compliance**: the obligations for the industry and locations, grouped from international down to local.

## Sample customers (healthcare and education)

```bash
# stop the server first (Ctrl+C), then:
npm run seed-samples            # or: node scripts/seed-samples.js --traffic 4 --ai 2 --model gemma3:4b
npm start
```

This creates two fictional customers and drives them through the real API, so everything you see afterwards is genuine:

| | Pulse Emergency Hospital Pvt Ltd | Lakeshore University |
|---|---|---|
| Industry | Healthcare | Education |
| Operates in | India only: Mumbai, Maharashtra (national and Maharashtra rules) | US, New York, Illinois, EU |
| Documents | 13 (DPDP Act, CERT-In incident response, Mental Healthcare Act, records retention, Maharashtra registration, ABDM, 42 CFR Part 2, breach procedure, retention, AI policy, ...) | 8 (FERPA, SHIELD Act, BIPA, GDPR notice, AI guidance, ...) |
| Sign in as | `pe.owner`, `pe.compliance`, `pe.nurse`, `pe.security`, `pe.mrd`, `pe.auditor` | `lu.owner`, `lu.compliance`, `lu.faculty`, `lu.registrar`, `lu.auditor` |

- Deployments use the model already loaded in your local Ollama (Gemma preferred).
- `--traffic N` sends N real questions per organization through the assistant, and `--ai N` runs N AI compliance reviews. These are real inference calls, so on a CPU-only machine expect roughly 30-90 seconds each. Use `--traffic 0 --ai 0` to skip them.
- Both organizations are marked as demo tenants (a small "Demo tenant" chip in the shell bar). The seeder also assigns compliance tasks, writes an evaluation set and runs it, drafts training data from a document, records a rating, and builds an own model (`pulse-assistant:v1`, `lakeshore-assistant:v1`, taught the approved examples) when Ollama is reachable.
- Compliance decisions are seeded only where a sample policy document strongly matches an obligation, and they are labeled "Sample decision". Everything else is left open so the gaps are visible.
- On a local machine there are no passwords: the sign-in page lists the accounts (`VECTOR_AUTH=password` turns passwords back on for real deployments).

## Version 3: the client workspace

The product now uses an SAP-style shell: a dark shell bar with search, task notifications and the user menu, and a tab bar (Home, Assistant, Models, Knowledge, Intelligence, Compliance, Tasks, AI metrics, Audit; admin pages under More). There is no sidebar.

- **Home**: a launchpad of tiles (my tasks, documents, models, readiness, open gaps, expected loss, audit chain, AI requests, speed, grounded answers) plus a world map, largest expected losses, usage and a readable activity feed.
- **Models**: see what is running and pick a model with one button ("Use this model" downloads it if needed, loads it and makes it available in the Assistant). Advanced settings stay under More → Deployments.
- **Knowledge**: drag-and-drop upload of text, Markdown, CSV, JSON or HTML; tags; department; and per document whether the AI may use it for answers, for training data, or both. Usage per document (retrievals, last used, training examples) is shown here and in AI metrics.
- **Intelligence** ("own your intelligence"): evaluation sets run as real requests against any deployment and compared across models; training data drafted from documents by your own model, added by hand, or promoted from answers people rated helpful and chose to share, each approved by a person; JSONL export in the standard chat format for LoRA or full fine-tuning on a GPU host; and "Build your own model", which packages a base model with your instructions and parameters through Ollama's model builder. Building does not change weights; a trained adapter is loaded the same way with an `ADAPTER` line in a Modelfile.
- **Compliance**: a filterable list (country or state, level, status, signal, topic), a world map and a US-states map shaded by readiness, open obligations, expected loss or recorded losses, a dashboard, recorded losses, platform controls and the report. Each obligation shows platform controls, matching documents, the exposure reference and estimate, tasks, an AI review, the decision and evidence.
- **Tasks**: assign compliance work to people (board and list views). Assignees can change status and comment; managers can edit, reassign and delete. Every change is in the hash chain and visible on the task.
- **Audit**: every block is described in plain words with the person's name ("Rohan Mehta marked the DPDP Act as Implemented"), next to the action code, both hashes and the time.

### Cards and applications (beyond private RAG)

**Cards** is the central page of everything an organization can do: platform capabilities plus applications for its industry. People star favourites, which also appear on Home.

Applications run on the organization's own model (`lib/apps.js`, `lib/routes-apps.js`): structured inputs, grounding in the organization's documents, a fixed output format and a review rule. Healthcare: PHI de-identification (pattern rules plus a model pass), discharge summary drafts, prior authorization letters, coding suggestions, breach risk assessment, vendor BAA review and patient message replies. Education: AI answer evaluation and accreditation evidence checks. Every industry: policy gap checks, summaries and contract clause extraction. Each run is measured in AI metrics and written to the audit trail as hashes of input and output.

The demo loader also deploys each customer's own model (`pulse-assistant:v1`, `lakeshore-assistant:v1`, taught the approved examples) and runs applications on it.

## Hardware

`lib/hardware.js` describes the actual machine: laptop, desktop, server or VM, make and model, CPU, memory and every GPU the OS reports (NVIDIA, AMD, Intel, Apple Silicon via Metal). It appears under More → Infrastructure, on the operator Home and on Models.

## Version 4: the guided story

The client tab bar is now: Home, Story, Documents, Models, Fine-tune, Assistant, Cards, Compliance, Tasks, Audit (Intelligence, AI metrics and admin pages under More).

- **Home** shows *Your personal AI*: the **Internal AI** (your own model, what it knows and learned, its evaluation) and the **Physical AI** (this machine, its processor, memory, Ollama runtime and models on disk, air-gapped), then favourites, one row of key tiles, the compliance map and the audit feed.
- **Story** (`#/story`) walks the end-to-end journey with live progress: physical AI → select documents → select models → fine-tune → internal chat → healthcare applications → compliance by country and state (US states map for US tenants; India and Maharashtra for Pulse) → reports → tasks and audit.
- **Fine-tune** (`#/finetune`): choose the documents to learn from, choose the base model (Gemma by default, add more in Models), let your model draft examples and approve them, then build a new version that is taught the approved examples (Ollama `MESSAGE` pairs on top of the base weights), deploy and evaluate it. Weight-level LoRA uses the JSONL export on a GPU host.
- **Compliance → Report**: a printable report (Print or save as PDF) by country and state with readiness, exposure, probable loss, the penalty reference for each rule and the audit chain head; for an India-only organization every amount is shown in rupees (converted at a fixed reference rate).
- `GET /api/personal-ai` returns the internal and physical AI summary. `POST /api/site/contact` stores contact-form requests from the landing page; operators read them at `GET /api/site/leads`.

## Version 5: the compliance check

Every applicable obligation comes with predefined requirements (`lib/requirements.js`): the documents it needs and the values someone must enter (registration numbers, officers, retention days, dates of the last drill, renewal dates). Specific lists exist for common Indian, US and EU rules; everything else gets a list from its category.

- **Compliance → Compliance check → Run compliance check** reads every document and entered value. It shows:
  - what is done and what is pending
  - documents needed, inputs needed and anything expired
  - **What is needed to be fully compliant**
- Values are validated against rules such as "at least 180", "must be a future date" or "within the last 365 days". Documents can match existing Knowledge or be uploaded against the requirement.
- **Assign** one item or **Assign all pending**, optionally routed by area. The assignee provides the document or value straight from the task. The task closes itself and the obligation moves to *In progress* or *Needs review* for sign-off.
- Every check run, value (stored in the ledger as a SHA-256 hash), upload, assignment and automatic closure is a block in the hash-chained audit trail.
- **API:**
  - `GET /api/compliance/requirements`
  - `POST /api/compliance/check`
  - `POST /api/compliance/check/assign`
  - `GET|PUT /api/compliance/:id/requirements/:key`

## Recorded demo

`docs/DEMO-PULSE.md` is a segment-by-segment script for an end-to-end Pulse Emergency Hospital demo, with the file to upload live in `docs/demo-files/`.

## The exposure model

Expected loss = exposure estimate × likelihood by status (not started 25%, needs review 15%, in progress 10%, implemented 3%, implemented with evidence 1%). Default estimates start from statutory maximums or published inflation-adjusted amounts checked on 2026-10-31 (for example HIPAA civil penalties of up to $2,190,294 per calendar year for identical violations, CCPA $2,663 / $7,988 per violation, FTC rule violations $53,088 per violation, GDPR up to EUR 20 million or 4% of turnover). They are illustrative starting points: replace them with your own estimate per obligation, and confirm figures with counsel.

### Maps

Country and US-state shapes come from Natural Earth via the `world-atlas` and `us-atlas` packages (public domain) and are stored in `public/geo/`. `scripts/build-geo.js` regenerates them (needs `world-atlas`, `us-atlas`, `topojson-client` and `i18n-iso-countries` installed temporarily).

## What the screens show

- **Overview (customer)**: object header, KPI tiles with sparklines, AI usage chart, compliance readiness donut, obligations by level, top open gaps, deployments, usage by department, the latest audit blocks.
- **AI metrics**: requests, tokens in and out, generation speed (tok/s), prompt processing speed, time to first token, p50/p95 latency, latency distribution, error rate, grounded-answer rate, cold starts, models in memory (RAM vs VRAM), and breakdowns by deployment, department, role and most-cited document. Every number comes from Ollama's own timing fields (`eval_count`, `eval_duration`, `prompt_eval_duration`, `load_duration`) plus server-measured time to first token. Prompts and answers are never stored in metrics.
- **Compliance**: readiness gauge, signal band per obligation, coverage map (level x topic), platform controls, and per-obligation detail with:
  - **platform controls** that support it (audit ledger, RBAC, on-prem inference, hash-only logging, department scoping, evidence integrity, authentication, AI oversight),
  - **matching documents** found by keyword retrieval over the organization's knowledge base (titles you cannot open are redacted),
  - **evidence** on file, and
  - an **AI review** where your own model reads the matching documents and returns covered / partial / not covered with reasons and what is missing.
  These combine into a signal score. It never changes a status; a person decides, and every decision is ledgered.
- **Knowledge map**: interactive graph of departments, documents, deployments, models and obligations, built from real retrievals (which documents each deployment actually cited) and document-to-obligation matches.
- **Audit ledger**: chain strip of the latest blocks with their hash links, animated verification, activity charts, a weekday/hour heatmap, and **external anchors**: record the head hash, keep the receipt outside the server, and every later check confirms the anchored block still matches.
- **Operations (Vector team)**: local Ollama runtime (version, response time, installed and loaded models, RAM vs VRAM, which deployments use each model), host CPU, memory and GPU, AI requests per customer, latency, customer health, every audit chain.

## What each part does

- **Models**: installed models, a catalog of Gemma 4, Gemma 3 (incl. QAT builds) and a few others, a VRAM fit hint, streamed downloads, details, delete, or pull any Ollama tag.
- **Infrastructure**: live GPU utilization, VRAM, temperature and power (via `nvidia-smi`), CPU and memory, which models are loaded and how much of each sits in VRAM, plus extra Ollama nodes.
- **Deployments**: start, stop, restart, edit, benchmark (speed only), delete. Operators see every customer's deployments and health.
- **Compliance**: 151 starter obligations across 40 jurisdictions and 14 industries (international, regional, national, state, local). Status, owner, notes, hashed evidence files, custom obligations for local or contractual rules, AI-drafted analysis (always labeled, never changes a status), CSV/JSON report stamped with the ledger head.
- **Audit ledger**: see below.

## Roles

| Role | Can do |
|---|---|
| Vector Operator | Customers, deployment health across customers, ledgers. No prompts, documents or answers. |
| Organization Owner | Everything in the organization |
| Platform Administrator | Infrastructure, models, deployments |
| AI Engineer | Models, deployments, all knowledge |
| Security Administrator | Users, roles, audit ledger |
| Compliance Officer | Obligations, evidence, reports |
| Department Administrator | Their department's documents |
| Employee | Assistant, their department's documents, compliance view |
| Auditor | Read-only audit evidence |

Custom roles are supported. A role can only be granted by someone who holds every permission in it, the last owner cannot be removed, and denied attempts are written to the ledger.

## The audit ledger

Every sign-in, create, update, delete, model download, deployment action and AI request is appended to a per-organization chain (plus one platform chain). Each entry stores the SHA-256 of its canonical JSON including the previous entry's hash, so editing, deleting or reordering history breaks the chain. Prompts and answers are stored only as hashes.

- In the app: **Audit ledger → Verify chain**.
- Offline: export from the app, then `node scripts/verify-ledger.js export.json [expected-head-hash]`.
- Or point it at a ledger file in the data directory: `node scripts/verify-ledger.js data/ledger/ledger-platform.jsonl`.

**Honest limit:** this is tamper-evident, not tamper-proof. Someone with write access to the data directory could rebuild a consistent chain from scratch. Record the head hash somewhere outside this server (a ticket, an email, a printed page) after each audit, and pass it to the verifier.

## Air-gapped use

The server and UI make no outbound calls. Pull models on a connected machine, copy the Ollama model directory across, and `ollama list` will show them. The catalog is a static list.

## Limits you should know about

- Ollama and GPU behavior was tested against a mock Ollama and a fake `nvidia-smi`, not on real GPU hardware or with real model output. Expect to adjust on first contact with your machine.
- The compliance pack is a **starter reference, not legal advice and not exhaustive**. Entries marked "verify with counsel" had dates or scope still moving. Where a state or city has no entries, the app says so. Add local and contractual rules as custom obligations. Have counsel confirm against primary sources.
- Retrieval is keyword-based (BM25), not embeddings.
- Compliance signals use keyword matching between obligation text and your documents, plus a fixed mapping of platform controls. They point people to the right place; they are not an audit opinion. AI reviews are only as good as the model and documents, and on CPU they are slow.
- The mock Ollama reports invented timings. Metrics only mean something against a real Ollama.
- The benchmark measures speed only, not answer quality.
- Sessions are held in memory: restarting the server signs everyone out.
- Several organizations on one host is for evaluation. For strict isolation, give each customer their own instance and Ollama.
- Ollama has no authentication; keep it on a private network.
- Not included: SSO, embeddings, scheduled AI reviews, security-policy editor, Docker packaging, high availability.

## Security notes

Passwords are hashed with scrypt, logins lock out after repeated failures, session cookies are HttpOnly and SameSite=Strict, writes require a same-origin request, and the UI escapes everything it renders. Run behind HTTPS in production.

## Development

```bash
npm test          # 18 API tests
npm run seed-demo
```

Layout: `server.js`, `lib/` (API, RBAC, ledger, Ollama client, GPU, compliance), `public/` (the app), `public-site/` (marketing site), `scripts/`, `test/`.

# Recorded demo: Pulse Emergency Hospital, end to end

A 12 to 15 minute journey you can record in segments. Pulse Emergency Hospital Pvt Ltd is a hospital in Mumbai, Maharashtra, India. It follows India's national rules and Maharashtra's state rules. Everything runs on one laptop, offline, on an open-weight Gemma model through Ollama.

The story in one sentence: **a hospital signs in, selects its documents, selects its models, fine-tunes its own model, chats with it internally, uses it for healthcare work beyond chat, and sees every national and state rule it must follow with the probable loss in rupees and a printable report, all proven in a tamper-evident audit trail.**

---

## Before you record

1. `ollama serve` is running and a Gemma model is pulled: `ollama pull gemma3:4b`.
2. Stop Vector, delete or rename the `data` folder, then `npm start`. Wait for `[demo] done` in the terminal (a few minutes on a laptop; it makes real requests to your model).
3. Optional, for the "air-gapped" point: turn off Wi-Fi after step 2. Everything keeps working.
4. Open two browser tabs: `http://127.0.0.1:8080/` (site) and `http://127.0.0.1:8080/app/` (product).
5. On a CPU-only laptop each AI answer takes 20 to 90 seconds. Record in segments to cut the waiting.

## Who is who

| Account | Person | Use them for |
|---|---|---|
| `pe.owner` | Dr. Meera Iyer, Director (Organization Owner) | Home, Story, Documents, Fine-tune, Cards |
| `pe.nurse` | Sister Anjali Pawar, Clinical | Internal chat |
| `pe.compliance` | Rohan Mehta, Compliance Officer | Compliance, tasks, report |
| `pe.mrd` | Sneha Patil, Medical Records | Receives a task |
| `pe.security` | Vikram Rao, Security Administrator | Audit chain |

---

## Segment 1. Why this exists (landing page, 60 s)

- Hero: "AI that your organization owns." Point at the animated product preview: Internal AI and Physical AI.
- Scroll through:
  - the customers strip
  - **Two kinds of AI**
  - **How it works** (six steps)
  - **Industries**: click Medical, Law, Education, Logistics and Finance
  - **Healthcare**
  - **Compliance**: India, national and Maharashtra
- **Company**: MIT-WPU (27,000 students, 700 faculty, $320,000+ payments, the rule layers), Shri Ram College of Commerce, Illuminati Humanista, Pulse Emergency Hospital, and the team.

Say: "Today I'll show Pulse Emergency Hospital in Mumbai. Everything you'll see runs on this laptop."

## Segment 2. Sign in as the hospital (60 s)

- Product → **Dr. Meera Iyer (Director)**.
- **Home → Your personal AI**:
  - **Internal AI**: `pulse-assistant:v1`, built from Gemma, what it knows and the examples it learned.
  - **Physical AI**: read it aloud ("this laptop: processor, memory, Ollama, models on disk, air-gapped").
- Click **Walk through the journey** to open **Story**. Use it as the agenda.

## Segment 3. Select documents (90 s)

- **Documents** → drag in `docs/demo-files/pulse-mobile-device-policy.md`.
  - Tags: `security, mobile, dpdp`. Department: `IT Security`.
  - Tick **Use for answers** and **Use for training**.
- Point at the SHA-256 hash and the usage columns.

Say: "Documents stay on this machine. Each one is hashed and tagged, and the AI only retrieves what each person is allowed to see."

## Segment 4. Select models (45 s)

- **Models**: Gemma is running. Show **Use this model** on another open-weight model, without clicking it (it would download).

Say: "Gemma is our default on-site model. The hospital can add or swap models any time without changing its workflows."

## Segment 5. Fine-tune (2 min + model time)

- **Fine-tune**:
  1. Tick the new mobile device policy and **Save selection**.
  2. Base model: `gemma3:4b`.
  3. Pick a document and click **Draft 4 examples**. Approve two, reject one.
  4. Build `pulse-assistant:v2` with **Teach it the approved examples** ticked.
- **Deploy** the new version, then **Evaluate**. Results appear under More → Intelligence → Evaluations.

Say: "The hospital's own model drafts examples from its documents, a person approves what it learns, and a new version is built and tested on this laptop. For weight-level fine-tuning the same approved data exports as JSONL and trains a LoRA on a GPU machine."

## Segment 6. Internal chat (60 s + model time)

- **Switch account → Sister Anjali Pawar**.
- **Assistant**: "Within how many hours must a cyber incident be reported to CERT-In?"
- Show the citations and tokens per second. Click **Helpful**.

## Segment 7. Beyond chat: healthcare applications (2 min + model time)

- **Switch account → Dr. Meera Iyer**, then open **Cards**.
  - **PHI de-identification** → Load example → Run. Names, Aadhaar, phone, PIN code, UHID and dates are masked.
  - **Discharge summary draft** → Load example → Run.
  - **Breach risk assessment** → Load example → Run. It shows deadlines under the CERT-In Directions and the DPDP Act.
- Optional: **Insurance pre-authorization letter**, **Coding suggestions**.

## Segment 8. Compliance check: done, pending, assigned (3 min)

- **Switch account → Rohan Mehta, Compliance Officer**. **Compliance** opens on **Compliance check**.
  - The hospital's rules are already predefined: India national rules, Maharashtra rules and international standards. Each rule has the documents and values it needs.
  - Some values were already entered: registration numbers, the CERT-In contact, log retention and the last drill date.
- Press **Run compliance check**. It reads every document in the system and every entered value, then shows:
  - percent of requirements met, with counts of complete, partial and pending rules
  - documents needed, inputs needed, and anything expired (the Maharashtra registration date has passed)
  - **What is needed to be fully compliant**: every missing document and every missing number, name or date
- Click **Enter** on *PC-PNDT registration number*, type `MH/MUM/PNDT/2025/0912` and save. The item turns Done at once.
- Click **Assign all pending** and keep **Route each item to the right team** ticked. Security and incident items go to Vikram Rao, records to Sneha Patil, and the rest to Rohan.
- Open **By obligation** → **Bio-Medical Waste Management Rules, 2016**: see which requirements are done, with who provided each one and when, and which are pending.
- **Switch account → Sneha Patil**. **Tasks** → open *Provide: …* → **Enter the value**. The task closes itself and the obligation's progress goes up.
- Fully met rules move to **Needs review** for a person to sign off. Nothing is marked implemented automatically.
- **Map** → click **India**: readiness and the probable loss in rupees, for national and Maharashtra rules.

## Segment 9. Reports and proof (90 s)

- **Compliance → Report** → **Print or save as PDF**: by country and state, the penalty for each rule, the probable loss and the audit chain head.
- **Switch account → Vikram Rao**. Open **Audit**.
  - Read the sentences: "Rohan Mehta ran the compliance check: 30 of 59 requirements met…", "Sneha Patil provided … · value hash …", "Task … closed automatically", "Dr. Meera Iyer built the custom model pulse-assistant:v2".
  - **Verify chain**, then **Anchor current head**.

## Segment 10. Close (20 s)

Back on **Home → Physical AI**: "All of this ran on this laptop, offline. In production it's the hospital's own servers in Mumbai. The data never leaves, and the intelligence is theirs."

---

## Honest lines to keep in the voice-over

- Applications produce drafts; doctors, coders, the compliance office and counsel decide.
- On a laptop, fine-tuning teaches the model approved examples on top of the base weights. Weight-level LoRA uses the export on a GPU host.
- Readiness and probable loss are indicators from an editable model, not legal advice. Rupee figures are converted at a fixed reference rate.
- The in-app hospital data is a sample tenant (marked "Demo tenant").

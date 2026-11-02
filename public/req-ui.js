// Shared UI for compliance requirements: provide a document or a value, assign the work.
import { esc, put, post, modal, field, options, readFileText, toast, ago } from './ui.js';

export const REQ_STATE = { met: ['Done', 'ok'], missing: ['Needed', 'bad'], expired: ['Expired', 'warn'], invalid: ['Check value', 'warn'] };
export const reqChip = (q) => { const [l, k] = REQ_STATE[q.status] || [q.status, '']; return `<span class="rq ${k}">${l}</span>`; };
export const reqIcon = (q) => `<span class="rqi ${q.status === 'met' ? 'ok' : q.status === 'missing' ? 'bad' : 'warn'}">${q.status === 'met' ? '✓' : q.status === 'missing' ? '' : '!'}</span>`;
export function reqEvidence(q) {
  if (!q.evidence) return '';
  if (q.kind === 'doc') return `<span class="faint">${esc(q.evidence.how)}: <b style="color:var(--ink)">${esc(q.evidence.title)}</b>${q.evidence.by ? ` · ${esc(q.evidence.by)}` : ''}${q.evidence.at ? ` · ${ago(q.evidence.at)}` : ''}</span>`;
  return `<span class="faint">value <b style="color:var(--ink)">${esc(q.evidence.value)}</b>${q.problem && q.status !== 'met' ? ` <span style="color:var(--warn)">(${esc(q.problem)})</span>` : ''} · ${esc(q.evidence.by || '')} · ${ago(q.evidence.at)}</span>`;
}
const rule = (q) => [q.min != null ? `at least ${q.min}` : '', q.future ? 'must be a future date' : '', q.maxAgeDays ? `within the last ${q.maxAgeDays} days` : ''].filter(Boolean).join(' · ');

// Open the "provide" form for one requirement. Resolves with the server response after saving.
export function provide(ob, q) {
  return new Promise((resolve) => {
    const isDoc = q.kind === 'doc';
    const html = `<p class="mute" style="margin-bottom:12px">Needed for <b>${esc(ob.title)}</b>${ob.jurisdictionName ? ` (${esc(ob.jurisdictionName)})` : ''}.${q.hint ? ' ' + esc(q.hint) : ''}</p>` +
      (isDoc
        ? `${field('Document title', `<input class="input" name="title" value="${esc(q.label)}">`)}${field('File (text, Markdown, CSV, JSON or HTML)', '<input class="input" type="file" name="file" accept=".txt,.md,.markdown,.csv,.json,.html,.htm">')}${field('Or paste the text', '<textarea class="textarea" name="text" style="min-height:140px" placeholder="Paste the policy, procedure or record"></textarea>', 'It is added to Documents, hashed with SHA-256, and linked to this requirement.')}`
        : field(q.label, `<input class="input" name="value" type="${q.type === 'date' ? 'date' : q.type === 'number' ? 'number' : 'text'}" value="${esc(q.evidence ? q.evidence.value : '')}">`, rule(q) || 'Saved with your name and time; the audit trail stores a hash of the value.'));
    modal({ title: isDoc ? 'Upload document' : 'Enter value', html, actions: [{ label: 'Save', primary: true, onClick: async (m) => {
      let body;
      if (isDoc) {
        const f = m.$('[name=file]').files[0];
        const text = f ? await readFileText(f) : m.$('[name=text]').value;
        if (!text.trim()) throw new Error('Choose a file or paste the text');
        body = { document: { title: m.$('[name=title]').value || q.label, text, fileName: f ? f.name : null } };
      } else body = { value: m.$('[name=value]').value };
      const r = await put(`/api/compliance/${encodeURIComponent(ob.id)}/requirements/${encodeURIComponent(q.key)}`, body);
      toast(r.requirement.status === 'met' ? `Done: ${q.label}` : `Saved, but ${r.requirement.problem || 'still not met'}`, r.requirement.status === 'met' ? 'ok' : 'bad');
      resolve(r);
    } }] });
  });
}

// Assign one requirement (or several) to a person.
export function assign(people, items, { title = 'Assign', defaultAssignee = '', all = false } = {}) {
  return new Promise((resolve) => {
    const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    modal({ title, html: `<p class="mute" style="margin-bottom:12px">${items.length === 1 ? `Creates a task: <b>${esc((items[0].kind === 'doc' ? 'Upload: ' : 'Provide: ') + items[0].label)}</b>` : `Creates ${items.length} tasks.`} The assignee can provide it straight from the task, and the check updates when they do.</p>
      ${all ? '<label class="check" style="margin-bottom:10px"><input type="checkbox" name="route" checked> Route each item to the right team (security and incidents to IT Security, records to Medical Records, AI to the AI engineer). Everything else goes to the person below.</label>' : ''}<div class="row">${field(all ? 'Everything else to' : 'Assign to', `<select class="select" name="who">${options(people.map((p) => [p.id, p.name]), defaultAssignee)}</select>`)}${field('Due', `<input class="input" type="date" name="due" value="${due}">`)}${field('Priority', `<select class="select" name="pri">${options([['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']], items.some((i) => i.status === 'expired') ? 'high' : 'medium')}</select>`)}</div>`,
      actions: [{ label: 'Assign', primary: true, onClick: async (m) => {
        const who = m.$('[name=who]').value, dueDate = m.$('[name=due]').value, priority = m.$('[name=pri]').value;
        const r = all ? await post('/api/compliance/check/assign', { all: true, route: m.$('[name=route]').checked, assigneeId: who, days: Math.max(1, Math.round((new Date(dueDate) - Date.now()) / 864e5)) })
          : await post('/api/compliance/check/assign', { items: items.map((i) => ({ obligationId: i.obligationId, key: i.key, assigneeId: who, dueDate, priority })) });
        toast(`${r.created} task${r.created === 1 ? '' : 's'} assigned`); window.dispatchEvent(new Event('vector:tasks')); resolve(r);
      } }] });
  });
}

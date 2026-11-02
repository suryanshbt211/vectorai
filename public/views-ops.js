// Vector operators: one customer's health, usage and compliance posture (aggregates only).
import { esc, get, badge, ago, sh, num, statusBadge, pagehead } from './ui.js';
import { tip, fmtN, fmtMs, columnChart, donut, hbars } from './charts.js';
import { card, tl } from './views-insights.js';
import { usd0 as usd } from './views-home.js';
import { worldSvg, readinessColor, legend } from './maps.js';

const BAND = { evidenced: ['Evidenced', 'var(--ok)'], supported: ['Supported', 'var(--c1)'], partial: ['Partial', 'var(--c4)'], gap: ['Gap', 'var(--bad)'], na: ['Not applicable', 'var(--faint)'] };
const tileHtml = (t, n, f = '', cls = '') => `<div class="lp-tile ${cls}" style="cursor:default"><div class="t">${esc(t)}</div><div class="n">${n}</div><div class="f">${f}</div></div>`;

const customer = {
  title: 'Customer', perm: 'ops.view', scope: 'platform',
  async render(ctx) {
    const { root } = ctx;
    const id = ctx.query.id;
    if (!id) { ctx.nav('#/customers'); return; }
    let range = '7d';
    const draw = async () => {
      const d = await get(`/api/ops/orgs/${encodeURIComponent(id)}?range=${range}`);
      if (!ctx.alive()) return;
      const o = d.org, m = d.metrics, c = d.compliance, t = m.totals;
      const running = d.deployments.filter((x) => x.status === 'running').length;
      const ini = o.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
      let h = `<div class="row" style="margin-bottom:10px"><a class="btn sm ghost" href="#/customers">← All customers</a><span class="sp"></span><div class="seg">${['24h', '7d', '30d'].map((r) => `<button class="${r === range ? 'on' : ''}" data-act="range" data-r="${r}">${r}</button>`).join('')}</div></div>`;
      h += `<div class="ohead"><div class="av">${esc(ini)}</div><div><h2>${esc(o.name)} ${o.disabled ? badge('Disabled', 'bad') : badge('Active', 'ok')} ${o.demo ? '<span class="tag">demo tenant</span>' : ''}</h2><div class="sub">${esc(o.industry)} · ${o.jurisdictions.map(esc).join(', ')} · ${esc(o.deploymentType.replace('_', ' '))} · customer since ${esc(o.createdAt.slice(0, 10))}</div></div><div class="attrs"><div class="attr"><div class="l">People</div><div class="x">${d.users.active} active</div></div><div class="attr"><div class="l">Last sign-in</div><div class="x">${d.users.lastLogin ? ago(d.users.lastLogin) : 'never'}</div></div><div class="attr"><div class="l">Audit chain</div><div class="x" style="color:${d.ledger.ok ? 'var(--ok)' : 'var(--bad)'}">${d.ledger.ok ? 'Intact' : 'BROKEN'}</div></div></div></div>`;
      h += `<div class="lp-tiles" style="margin-bottom:18px">
        ${tileHtml('Deployments', `${running}<small>/ ${d.deployments.length}</small>`, 'running', running < d.deployments.length ? 'warnc' : 'good')}
        ${tileHtml('AI requests', num(t.requests), `${t.users} people · last ${range}`)}
        ${tileHtml('Speed', `${t.tps ?? '-'}<small>tok/s</small>`, t.p95 != null ? `p95 ${fmtMs(t.p95)}` : 'no requests')}
        ${tileHtml('Readiness', `${c.readiness}<small>%</small>`, `${c.total} obligations`, c.readiness >= 60 ? 'good' : 'warnc')}
        ${tileHtml('Open gaps', num(c.bands.gap || 0), `${c.controlsActive}/${c.controls} platform controls active`, c.bands.gap ? 'crit' : 'good')}
        ${tileHtml('Expected loss', usd(c.totals.expectedLossUSD), `exposure ${usd(c.totals.exposureUSD)}`, 'warnc')}
        ${tileHtml('Tasks', num(d.tasks.open + d.tasks.inProgress + d.tasks.blocked), `${d.tasks.overdue} overdue · ${d.tasks.done} done`, d.tasks.overdue ? 'crit' : '')}
        ${tileHtml('Knowledge', num(d.knowledge.documents), `${d.knowledge.training} approved training examples`)}
      </div>`;
      const labels = m.series.map((x) => tl(x.t, m.stepMs));
      h += `<div class="grid3">
        <div class="card g-wide pad0"><div class="ch"><div><div class="tt">Compliance by country</div><div class="st">Readiness per place in scope</div></div></div><div class="mapwrap" style="border:0;box-shadow:none;border-radius:0" id="cmap"></div><div class="maplegend">${legend('readiness')}</div></div>
        ${card('Readiness', `${c.total} obligations`, donut({ items: ['evidenced', 'supported', 'partial', 'gap', 'na'].filter((k) => c.bands[k]).map((k) => ({ label: BAND[k][0], value: c.bands[k], color: BAND[k][1] })), center: `${c.readiness}%`, sub: 'readiness', size: 130 }))}
        ${card('AI requests', `Per ${m.stepMs < 864e5 ? 'hour' : 'day'}`, columnChart({ labels, series: [{ name: 'Succeeded', values: m.series.map((x) => x.requests - x.errors), color: 'var(--c1)' }, { name: 'Failed', values: m.series.map((x) => x.errors), color: 'var(--c8)' }], height: 170 }), { cls: 'g-wide' })}
        ${card('Request types', '', donut({ items: m.byKind.map((g, k) => ({ label: g.key, value: g.requests, color: `var(--c${(k % 8) + 1})` })), center: num(t.requests), sub: 'requests', size: 120 }))}
        ${card('Deployments', 'Status and usage', `<div class="tblwrap"><table class="tbl"><tbody>${d.deployments.map((x) => `<tr><td><b>${esc(x.name)}</b><div class="mono faint" style="font-size:12px">${esc(x.model)}</div></td><td style="text-align:right;white-space:nowrap">${statusBadge(x.status)}<div class="note" style="margin:3px 0 0">${num(x.requests)} requests · ${x.lastUsedAt ? ago(x.lastUsedAt) : 'never used'}</div></td></tr>`).join('') || '<tr><td class="mute">No deployments.</td></tr>'}</tbody></table></div>`)}
        ${card('People by role', `${d.users.total} accounts`, hbars(Object.entries(d.users.byRole).map(([k, n]) => ({ label: k, value: n, color: 'var(--c7)' }))))}
        ${card('Compliance tasks', 'By status', donut({ items: [['Open', d.tasks.open, 'var(--c1)'], ['In progress', d.tasks.inProgress, 'var(--c4)'], ['Blocked', d.tasks.blocked, 'var(--c8)'], ['Done', d.tasks.done, 'var(--c3)']].filter(([, n]) => n).map(([label, value, color]) => ({ label, value, color })), center: String(d.tasks.total), sub: 'tasks', size: 120 }))}
        ${card('Places in scope', 'Readiness and expected loss', hbars(c.places.filter((p) => !p.via).map((p) => ({ label: (p.level === 'state' ? '· ' : '') + p.name, value: p.readiness || 0, color: readinessColor(p.readiness), tip: tip(p.name, [['Readiness', (p.readiness ?? '-') + '%'], ['Open', String(p.open)], ['Expected loss', usd(p.expectedLossUSD)]]) })), { fmt: (v) => v + '%', max: 100 }))}
        ${card('Audit chain', `${num(d.ledger.length)} blocks · ${d.ledger.anchors} anchors`, `<dl class="kv" style="grid-template-columns:110px 1fr;margin-bottom:10px"><dt>Integrity</dt><dd>${d.ledger.ok ? badge('Intact', 'ok') : badge('Broken at ' + d.ledger.brokenAt, 'bad')}</dd><dt>Head</dt><dd class="mono" title="${esc(d.ledger.head)}">${esc(sh(d.ledger.head))}</dd><dt>Last activity</dt><dd>${d.ledger.lastActivity ? ago(d.ledger.lastActivity) : '-'}</dd></dl>` + hbars(d.ledger.byArea.slice(0, 6).map((x) => ({ label: x.key, value: x.n, color: 'var(--c1)' }))))}
        ${card('Own intelligence', 'Models and evaluations', `<dl class="kv" style="grid-template-columns:140px 1fr"><dt>Own models</dt><dd>${d.knowledge.customModels.map((n) => `<span class="tag">${esc(n)}</span>`).join(' ') || '-'}</dd><dt>Evaluation runs</dt><dd>${d.knowledge.evalRuns}</dd><dt>Models used</dt><dd>${m.byModel.map((g) => `<span class="tag">${esc(g.key)} · ${g.requests}</span>`).join(' ') || '-'}</dd><dt>Tokens generated</dt><dd>${fmtN(t.completionTokens)}</dd></dl>`)}
      </div><p class="note" style="margin-top:14px">${esc(d.notice)}</p>`;
      root.innerHTML = h;
      const vals = {};
      for (const p of c.places.filter((x) => x.level === 'national')) vals[p.code] = { fill: readinessColor(p.readiness), tip: tip(p.name + (p.via ? ' (via EU)' : ''), [['Readiness', (p.readiness ?? '-') + '%'], ['Obligations', String(p.total)], ['Open', String(p.open)], ['Expected loss', usd(p.expectedLossUSD)]]) };
      const el = root.querySelector('#cmap'); if (el) el.innerHTML = await worldSvg(vals);
    };
    ctx.acts.range = (b) => { range = b.dataset.r; draw(); };
    await draw();
    let first = true;
    ctx.poll(async () => { if (first) { first = false; return; } await draw(); }, 15000);
  },
};

export const views = { customer };

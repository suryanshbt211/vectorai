'use strict';
// Host metrics: NVIDIA GPUs through nvidia-smi, CPU and memory through Node's os module.
// A background sampler keeps a short history so charts have data as soon as a page opens.
const { execFile } = require('child_process');
const os = require('os');
const { hardware } = require('./hardware');

const SMI = () => process.env.VECTOR_NVIDIA_SMI || 'nvidia-smi';
const FIELDS = 'index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit,driver_version';
const num = (x) => { const v = parseFloat(x); return Number.isFinite(v) ? v : null; };

function nvidia() {
  return new Promise((resolve) => {
    execFile(SMI(), [`--query-gpu=${FIELDS}`, '--format=csv,noheader,nounits'], { timeout: 4000 }, (err, out) => {
      if (err) {
        const reason = err.code === 'ENOENT'
          ? 'nvidia-smi was not found, so no NVIDIA driver is available on this host'
          : String(err.message).split('\n')[0];
        return resolve({ available: false, reason, gpus: [] });
      }
      const gpus = String(out).trim().split('\n').filter(Boolean).map((line) => {
        const c = line.split(',').map((s) => s.trim());
        return { index: num(c[0]), name: c[1], util: num(c[2]), memUsedMiB: num(c[3]), memTotalMiB: num(c[4]), tempC: num(c[5]), powerW: num(c[6]), powerLimitW: num(c[7]), driver: c[8] };
      });
      resolve({ available: gpus.length > 0, source: 'nvidia-smi', gpus, reason: gpus.length ? null : 'nvidia-smi reported no GPUs' });
    });
  });
}

let prevCpu = null;
function cpuPercent() {
  const cur = os.cpus().reduce((a, c) => { const t = c.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, total: 0 });
  let pct = null;
  if (prevCpu) { const dt = cur.total - prevCpu.total, di = cur.idle - prevCpu.idle; pct = dt > 0 ? Math.round((1 - di / dt) * 1000) / 10 : 0; }
  prevCpu = cur;
  return pct;
}

async function snapshot() {
  const total = os.totalmem(), free = os.freemem();
  return {
    gpu: await nvidia(),
    hardware: await hardware(),
    cpu: { cores: os.cpus().length, model: (os.cpus()[0] || {}).model || 'unknown', load1: Math.round(os.loadavg()[0] * 100) / 100, percent: cpuPercent() },
    memory: { totalBytes: total, usedBytes: total - free, percent: Math.round(((total - free) / total) * 1000) / 10 },
    host: { name: os.hostname(), platform: os.platform(), arch: os.arch(), uptimeSec: Math.round(os.uptime()) },
  };
}

class Sampler {
  constructor(localOllama, intervalMs = 3000, keep = 120) { this.ol = localOllama; this.intervalMs = intervalMs; this.keep = keep; this.history = []; this.timer = null; }
  async tick() {
    try {
      const s = await snapshot();
      let vram = null;
      try { vram = (await this.ol.ps()).reduce((a, m) => a + (m.size_vram || 0), 0); } catch (_) { /* ollama offline */ }
      this.history.push({ t: Date.now(), cpu: s.cpu.percent, mem: s.memory.percent, vramBytes: vram, gpus: s.gpu.gpus.map((g) => ({ util: g.util, memUsedMiB: g.memUsedMiB, tempC: g.tempC })) });
      if (this.history.length > this.keep) this.history.shift();
    } catch (_) { /* keep sampling */ }
  }
  start() { this.tick(); this.timer = setInterval(() => this.tick(), this.intervalMs); if (this.timer.unref) this.timer.unref(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = { snapshot, nvidia, Sampler };

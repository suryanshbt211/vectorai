'use strict';
// Describes the physical machine Vector and Ollama run on: device type (laptop, desktop, server, VM),
// make and model, CPU, memory and every graphics processor the OS reports (NVIDIA, AMD, Intel, Apple
// Silicon). Detected once at startup with short timeouts, then cached. Nothing leaves the machine.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

const run = (cmd, args, timeout = 4000) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, out) => resolve(err ? '' : String(out)));
});
const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch (_) { return ''; } };
const LAPTOP_CHASSIS = new Set([8, 9, 10, 11, 14, 30, 31, 32]); // SMBIOS: portable, laptop, notebook, hand held, sub notebook, tablet, convertible, detachable
const SERVER_CHASSIS = new Set([17, 23, 28, 29]);

async function detect() {
  const cpus = os.cpus();
  const hw = {
    hostname: os.hostname(), platform: os.platform(), arch: os.arch(), osRelease: os.release(),
    cpu: { model: ((cpus[0] || {}).model || 'unknown').replace(/\s+/g, ' ').trim(), cores: cpus.length },
    memoryBytes: os.totalmem(), deviceType: 'computer', vendor: null, model: null, gpus: [], accelerator: null, osName: null,
  };
  try {
    if (hw.platform === 'darwin') {
      hw.osName = 'macOS ' + (await run('sw_vers', ['-productVersion'])).trim();
      const model = (await run('sysctl', ['-n', 'hw.model'])).trim();
      hw.vendor = 'Apple'; hw.model = model || 'Mac';
      hw.deviceType = /book/i.test(model) ? 'laptop' : /^Mac(mini|Pro|Studio)|iMac/i.test(model) ? 'desktop' : 'computer';
      const sp = await run('system_profiler', ['SPDisplaysDataType', '-json'], 8000);
      try {
        for (const g of JSON.parse(sp).SPDisplaysDataType || []) {
          hw.gpus.push({ name: g.sppci_model || g._name, vendor: g.spdisplays_vendor || 'Apple', cores: g.sppci_cores ? Number(g.sppci_cores) : null, vram: g.spdisplays_vram || (/Apple/i.test(hw.cpu.model) ? 'unified memory' : null) });
        }
      } catch (_) { /* older macOS */ }
      if (/Apple/i.test(hw.cpu.model)) hw.accelerator = `${hw.cpu.model} GPU via Metal, sharing ${Math.round(hw.memoryBytes / 2 ** 30)} GB of unified memory with the CPU`;
    } else if (hw.platform === 'win32') {
      const ps = (q) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', q], 8000);
      const parse = (t) => { try { const v = JSON.parse(t); return Array.isArray(v) ? v : v ? [v] : []; } catch (_) { return []; } };
      const sys = parse(await ps('Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,PCSystemType | ConvertTo-Json'))[0] || {};
      const enc = parse(await ps('Get-CimInstance Win32_SystemEnclosure | Select-Object ChassisTypes | ConvertTo-Json'))[0] || {};
      const osi = parse(await ps('Get-CimInstance Win32_OperatingSystem | Select-Object Caption | ConvertTo-Json'))[0] || {};
      hw.vendor = sys.Manufacturer || null; hw.model = sys.Model || null; hw.osName = osi.Caption || 'Windows';
      const types = [].concat(enc.ChassisTypes || []).map(Number);
      hw.deviceType = sys.PCSystemType === 2 || types.some((t) => LAPTOP_CHASSIS.has(t)) ? 'laptop' : types.some((t) => SERVER_CHASSIS.has(t)) ? 'server' : 'desktop';
      for (const g of parse(await ps('Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json'))) {
        hw.gpus.push({ name: g.Name, vendor: /nvidia/i.test(g.Name) ? 'NVIDIA' : /amd|radeon/i.test(g.Name) ? 'AMD' : /intel/i.test(g.Name) ? 'Intel' : null, vram: g.AdapterRAM ? Math.round(g.AdapterRAM / 2 ** 20) + ' MB (reported)' : null, driver: g.DriverVersion || null });
      }
    } else {
      const pretty = (read('/etc/os-release').match(/PRETTY_NAME="?([^"\n]+)/) || [])[1];
      hw.osName = pretty || 'Linux';
      hw.vendor = read('/sys/class/dmi/id/sys_vendor') || null; hw.model = read('/sys/class/dmi/id/product_name') || null;
      const ct = Number(read('/sys/class/dmi/id/chassis_type'));
      const virt = /kvm|qemu|vmware|virtualbox|hyper-v|xen|amazon|google|microsoft corporation/i.test(`${hw.vendor} ${hw.model}`);
      hw.deviceType = virt ? 'virtual machine' : LAPTOP_CHASSIS.has(ct) ? 'laptop' : SERVER_CHASSIS.has(ct) ? 'server' : ct ? 'desktop' : 'computer';
      const l = await run('lspci', []);
      for (const line of l.split('\n').filter((x) => /vga|3d controller|display controller/i.test(x))) {
        const name = line.replace(/^\S+\s+/, '').replace(/^(VGA compatible controller|3D controller|Display controller):\s*/i, '');
        hw.gpus.push({ name, vendor: /nvidia/i.test(name) ? 'NVIDIA' : /amd|ati/i.test(name) ? 'AMD' : /intel/i.test(name) ? 'Intel' : null });
      }
    }
  } catch (_) { /* best effort: fall back to what os reports */ }
  const nv = hw.gpus.find((g) => g.vendor === 'NVIDIA');
  if (!hw.accelerator) hw.accelerator = nv ? `${nv.name} (CUDA)` : hw.gpus.find((g) => g.vendor === 'AMD') ? `${hw.gpus.find((g) => g.vendor === 'AMD').name} (ROCm or Vulkan, if supported by your Ollama build)` : `CPU inference on ${hw.cpu.cores} cores`;
  const make = [hw.vendor, hw.model].filter(Boolean).join(' ');
  hw.summary = `${hw.deviceType === 'computer' ? 'This computer' : 'This ' + hw.deviceType}${make ? ` (${make})` : ''} · ${hw.cpu.model} · ${Math.round(hw.memoryBytes / 2 ** 30)} GB RAM${hw.gpus.length ? ' · ' + hw.gpus.map((g) => g.name).join(', ') : ''}`;
  return hw;
}

let cached = null;
const hardware = () => (cached = cached || detect());
module.exports = { hardware };

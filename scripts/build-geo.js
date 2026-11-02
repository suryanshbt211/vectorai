// Builds compact SVG paths for the compliance maps from world-atlas (Natural Earth, public domain) and us-atlas.
const fs = require('fs');
const topo = require('topojson-client');
const countries = require('i18n-iso-countries');
const world = require('world-atlas/countries-110m.json');
const us = require('us-atlas/states-albers-10m.json');
const out = process.argv[2];
const W = 960, H = 470;
// Natural Earth I projection
function ne(lon, lat) {
  const l = lon * Math.PI / 180, p = lat * Math.PI / 180, p2 = p * p, p4 = p2 * p2;
  const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [W / 2 + x * 153, H / 2 - y * 153];
}
const ring = (pts, proj) => { let d = '', prev = null; for (const [a, b] of pts) { const [x, y] = proj(a, b); if (prev && Math.abs(x - prev) > W / 2) d += 'Z'; d += (d === '' || d.endsWith('Z') ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1); prev = x; } return d + 'Z'; };
const geomPath = (g, proj) => { const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; return polys.map((poly) => poly.map((r) => ring(r, proj)).join('')).join(''); };
const fc = topo.feature(world, world.objects.countries);
const wout = fc.features.filter((f) => f.properties.name !== 'Antarctica').map((f) => {
  const a2 = countries.numericToAlpha2(f.id) || (f.properties.name === 'Kosovo' ? 'XK' : null);
  return { id: a2 || 'N' + f.id, name: f.properties.name, d: geomPath(f.geometry, ne) };
});
fs.writeFileSync(out + '/world.json', JSON.stringify({ w: W, h: H, countries: wout }));
const sfc = topo.feature(us, us.objects.states);
const FIPS = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '72': 'PR' };
const sout = sfc.features.map((f) => ({ id: 'US-' + (FIPS[f.id] || f.id), name: f.properties.name, d: geomPath(f.geometry, (x, y) => [x, y]) }));
fs.writeFileSync(out + '/us-states.json', JSON.stringify({ w: 975, h: 610, states: sout }));
console.log(wout.length, 'countries', sout.length, 'states');

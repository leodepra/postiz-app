// Audit lockfile versions without expanding every dependency path in memory.
// Includes build/dev packages; this inventory does not assert runtime reachability.
const fs = require('node:fs');
const YAML = require('yaml');
const semver = require('semver');
async function main() {
  const lock = YAML.parse(fs.readFileSync('pnpm-lock.yaml', 'utf8'));
  const packages = {};
  for (const name of Object.keys(lock.packages || {})) {
    const match = /^(.+)@([^()]+)$/.exec(name);
    if (match && semver.valid(match[2])) (packages[match[1]] ||= []).push(match[2]);
  }
  const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(packages), signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error('Audit endpoint returned ' + response.status);
  const advisories = await response.json();
  const findings = Object.entries(advisories).flatMap(([name, entries]) => entries.map(entry => ({ ...entry, package: name,
    installed: packages[name].filter(version => semver.satisfies(version, entry.vulnerable_versions)),
  })).filter(entry => entry.installed.length));
  const totals = {};
  for (const finding of findings) totals[finding.severity] = (totals[finding.severity] || 0) + 1;
  const report = { timestamp: new Date().toISOString(), scope: 'all locked packages including dev; not a reachability analysis',
    packageNames: Object.keys(packages).length, totals, findings };
  fs.writeFileSync('security-audit/dependencies-after.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ packageNames: report.packageNames, totals }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

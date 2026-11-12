// Runs every dashboard panel query against a live Prometheus and reports syntax/eval errors.
// Usage: node observability/grafana/check-dashboards.cjs [http://localhost:9090]
const fs = require('fs'); const path = require('path');
const base = process.argv[2] || 'http://localhost:9090';
(async () => {
  const dir = path.join(__dirname, 'dashboards');
  let bad = 0, total = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const p of d.panels) for (const t of p.targets) {
      total++;
      const r = await fetch(`${base}/api/v1/query?query=${encodeURIComponent(t.expr)}`).then((x) => x.json());
      if (r.status !== 'success') { bad++; console.log(`FAIL ${f} / ${p.title}: ${r.error}`); }
    }
  }
  console.log(`${total - bad}/${total} queries valid`);
  process.exitCode = bad ? 1 : 0;
})();

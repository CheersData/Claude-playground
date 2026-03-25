import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'company', 'qa-results');
const files = fs.readdirSync(dir).filter(f => f.startsWith('qa-') && f.endsWith('.json'));

// Group by testId, keep latest
const latest = {};
for (const f of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    if (!data.testId) continue;
    const tsMatch = f.match(/(\d{13})\.json$/);
    const ts = tsMatch ? parseInt(tsMatch[1]) : 0;
    if (!latest[data.testId] || ts > latest[data.testId].ts) {
      latest[data.testId] = Object.assign({}, data, { ts, file: f });
    }
  } catch (_e) { /* skip */ }
}

const results = Object.values(latest).sort((a, b) =>
  a.testId.localeCompare(b.testId, undefined, { numeric: true })
);

let pass = 0, borderline = 0, fail = 0, noEval = 0, totalScore = 0;
for (const r of results) {
  if (!r.evaluation) { noEval++; continue; }
  totalScore += r.evaluation.total;
  if (r.evaluation.verdict === 'PASS') pass++;
  else if (r.evaluation.verdict === 'BORDERLINE') borderline++;
  else fail++;
}

const evaluated = pass + borderline + fail;
console.log('=== RISULTATI QA BATCH ===');
console.log('Totale test:', results.length);
console.log('PASS:', pass, '| BORDERLINE:', borderline, '| FAIL:', fail, '| No eval:', noEval);
console.log('Media score:', evaluated > 0 ? (totalScore / evaluated).toFixed(1) : 'N/A');
console.log('Pass rate:', evaluated > 0 ? (pass / evaluated * 100).toFixed(1) + '%' : 'N/A');
console.log('');
console.log('--- Dettaglio per test ---');
for (const r of results) {
  const ev = r.evaluation;
  const verdict = ev ? ev.verdict : 'NO-EVAL';
  const score = ev ? String(ev.total) : '-';
  const isNew = r.ts > 1773145000000;
  const flag = isNew ? 'NEW' : 'OLD';
  console.log(
    r.testId.padEnd(5) + ' | ' +
    verdict.padEnd(11) + ' | ' +
    score.padStart(3) + '/100 | ' +
    flag.padEnd(3) + ' | ' +
    r.question.slice(0, 55)
  );
}

// Count new vs old
const newCount = results.filter(r => r.ts > 1773145000000).length;
const oldCount = results.filter(r => r.ts <= 1773145000000).length;
console.log('\n--- Riepilogo ---');
console.log('Nuovi (batch odierno):', newCount);
console.log('Vecchi (batch precedente):', oldCount);
console.log('File totali su disco:', files.length);

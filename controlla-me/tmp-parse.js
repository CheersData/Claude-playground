const fs = require('fs');
const data = JSON.parse(fs.readFileSync('company/autorun-logs/qa-intern-2026-03-09T17-01-52.json','utf8'));
const results = data.map(t => ({
  id: t.testId,
  block: t.blockName,
  diff: t.difficulty,
  verdict: t.evaluation ? t.evaluation.verdict : (t.error ? 'ERROR' : 'N/A'),
  score: t.evaluation ? t.evaluation.total : 0,
  error: t.error || null,
  question: t.question.substring(0,80)
}));
results.sort((a,b) => {
  if (a.verdict === 'ERROR' && b.verdict !== 'ERROR') return -1;
  if (b.verdict === 'ERROR' && a.verdict !== 'ERROR') return 1;
  if (a.verdict === 'FAIL' && b.verdict === 'FAIL') return a.score - b.score;
  if (a.verdict === 'FAIL') return -1;
  if (b.verdict === 'FAIL') return 1;
  return a.score - b.score;
});
console.log('TOTAL:', results.length);
console.log('\n=== ERRORS ===');
results.filter(r => r.verdict === 'ERROR').forEach(r => console.log(r.id, '|', r.error, '|', r.question));
console.log('\n=== FAIL (worst first) ===');
results.filter(r => r.verdict === 'FAIL').forEach(r => console.log(r.id, '| score:', r.score, '| diff:', r.diff, '|', r.question));
console.log('\n=== BORDERLINE ===');
results.filter(r => r.verdict === 'BORDERLINE').forEach(r => console.log(r.id, '| score:', r.score, '| diff:', r.diff, '|', r.question));
console.log('\n=== PASS ===');
results.filter(r => r.verdict === 'PASS').forEach(r => console.log(r.id, '| score:', r.score, '|', r.question));
console.log('\n=== SUMMARY ===');
const c = {};
results.forEach(r => c[r.verdict] = (c[r.verdict]||0) + 1);
console.log(c);

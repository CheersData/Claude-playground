// Quick analysis of QA intern results
// eslint-disable-next-line @typescript-eslint/no-require-imports
const data = require('../company/autorun-logs/qa-intern-2026-03-08T17-54-33.json');
const results = data.filter(r => r.agentAnswer && r.error === null);
const errors = data.filter(r => r.error);

let artOk = 0, artMiss = 0, trapOk = 0, trapMiss = 0, trapTotal = 0;

const trapKeywords = {
  'norma_superata': ['cartabia', '171-ter', 'riforma 2022'],
  'falsa_tutela': ['agenzia.*riscossione', 'dpr 602', 'privat.*possono pignorare'],
  'dipende_dal_tipo': ['dipende', 'beneficio.*escussione'],
  'misconcezione_proprietà': ['non trasferisce', '2797'],
  'doppia_trappola': ['giusta causa.*valid', '2119'],
  'falsa_esclusione': ['vizi occulti', '1491'],
  'confusione_istituti': ['diversi', 'distinti'],
  'contraddizione_contrattuale': ['contraddizione', 'incompatibil', 'anomali', 'ambigui'],
  'clausola_abusiva': ['vessator', 'codice del consumo', 'codice consumo'],
  'requisito_non_ovvio': ['coltivator', 'non basta'],
  'distinzione_partecipante_terzo': ['partecipante', 'eri presente', 'lecit'],
  'evoluzione_giurisprudenza': ['sezioni unite', '18213'],
  'confine_penale_civile': ['dolo originario', 'prima di prendere'],
  'falsa_nullità': ['annullabil', 'non.*null'],
  'dipende_dal_tempo': ['20 anni', 'usucapione.*complet'],
  'interdisciplinare': ['asta.*non garant', 'vendita forzata.*non garant'],
  'falsa_estinzione': ['non.*estin', 'eredi.*succed', 'subentrano', 'non comporta'],
};

results.forEach(r => {
  const a = r.agentAnswer || '';
  const exp = r.expected.toLowerCase();

  // Check article citation
  const artMatches = exp.match(/art\.?\s*\d+/g) || [];
  const cites = artMatches.length === 0 || artMatches.some(art => a.toLowerCase().includes(art));
  if (cites) artOk++; else artMiss++;

  // Check trap recognition
  if (r.trapType && trapKeywords[r.trapType]) {
    trapTotal++;
    const keywords = trapKeywords[r.trapType];
    const recognized = keywords.some(kw => new RegExp(kw, 'i').test(a));
    if (recognized) trapOk++; else trapMiss++;
  }
});

console.log('=== RIEPILOGO QUALITÀ QA INTERN TIER ===');
console.log('');
console.log('Totale test: 50');
console.log('Risposte ricevute: ' + results.length + '/50');
console.log('Errori (corpus_agent_error): ' + errors.length);
console.log('');
console.log('--- ARTICOLI NORMATIVI ---');
console.log('Articoli attesi citati: ' + artOk + '/' + results.length + ' (' + (artOk/results.length*100).toFixed(0) + '%)');
console.log('Articoli attesi MANCANTI: ' + artMiss + '/' + results.length + ' (' + (artMiss/results.length*100).toFixed(0) + '%)');
console.log('');
console.log('--- DOMANDE TRAPPOLA ---');
console.log('Totale domande trappola: ' + trapTotal);
console.log('Trappola riconosciuta: ' + trapOk + '/' + trapTotal + ' (' + (trapOk/trapTotal*100).toFixed(0) + '%)');
console.log('Trappola NON riconosciuta: ' + trapMiss + '/' + trapTotal + ' (' + (trapMiss/trapTotal*100).toFixed(0) + '%)');

// Trap details
console.log('');
console.log('--- DETTAGLIO TRAPPOLE ---');
results.filter(r => r.trapType).forEach(r => {
  const a = r.agentAnswer || '';
  const keywords = trapKeywords[r.trapType] || [];
  const recognized = keywords.some(kw => new RegExp(kw, 'i').test(a));
  console.log((recognized ? '✅' : '❌') + ' ' + r.testId + ' [' + r.trapType + '] ' + r.question.slice(0, 60));
});

// Error details
console.log('');
console.log('--- ERRORI ---');
errors.forEach(r => {
  console.log('❌ ' + r.testId + ': ' + r.error + ' (' + (r.durationMs/1000).toFixed(0) + 's)');
});

// Timing
const totalMs = data.reduce((s, r) => s + r.durationMs, 0);
const avgMs = results.reduce((s, r) => s + r.durationMs, 0) / results.length;
console.log('');
console.log('--- TEMPI ---');
console.log('Tempo totale: ' + (totalMs/1000/60).toFixed(1) + ' min');
console.log('Tempo medio per risposta: ' + (avgMs/1000).toFixed(1) + 's');

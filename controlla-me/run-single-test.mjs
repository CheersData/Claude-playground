import crypto from 'crypto';

const secret = 'dev-console-secret-CHANGE-IN-PRODUCTION-min32chars!!';
const payload = JSON.stringify({nome:'QA',cognome:'Runner',ruolo:'qa',sid:'qa-retest',tier:'intern',disabledAgents:[],iat:Date.now(),exp:Date.now()+86400000});
const b64 = Buffer.from(payload).toString('base64url');
const hmac = crypto.createHmac('sha256', secret).update(b64).digest('hex');
const token = b64 + '.' + hmac;

const testId = process.argv[2] || 'TC27';
const question = process.argv[3] || 'Ho un debito con un privato. Possono pignorare la mia prima casa?';

console.log(`Running ${testId}...`);
const start = Date.now();

try {
  const res = await fetch('http://localhost:3000/api/company/legal-qa-tests', {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'x-csrf-token': '1'},
    body: JSON.stringify({action:'run',testId,question,tier:'intern'})
  });
  const elapsed = ((Date.now()-start)/1000).toFixed(1);
  console.log(`Status: ${res.status} (${elapsed}s)`);
  const text = await res.text();
  console.log(text);
} catch(e) {
  console.log('Error:', e.message);
}

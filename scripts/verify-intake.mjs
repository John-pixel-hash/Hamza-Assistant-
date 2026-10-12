// Live check of the intake engine against the real model. Run with:
// node --env-file=.env.local --import tsx scripts/verify-intake.mjs
import { runIntake } from '../lib/ai/intake.ts';

const started = Date.now();
const result = await runIntake({
  title: 'Store for Sara',
  brief:
    'Sara wants an online store for her clothing brand. She saw something on Instagram and wants similar. Needs it soon because she has a sale coming. She will pay around 300 dollars. She mentioned products and payments but nothing else really.',
  deliverables: ['Online store'],
  deadline: '2026-10-20',
  budget: '300',
  currency: 'USD',
  clientName: 'Sara Malik',
});

console.log('model:', result.modelId, 'repaired:', result.repaired, 'reason:', result.reason ?? 'none');
console.log('seconds:', ((Date.now() - started) / 1000).toFixed(1));
if (result.restatement) {
  console.log('goal:', result.restatement.goal);
  console.log('next_step:', result.restatement.next_step);
  console.log('deadline_risk:', result.restatement.deadline_risk);
  console.log('deliverables:', result.restatement.deliverables.join(' | '));
}
console.log('questions:', result.questions.length);
for (const q of result.questions) {
  console.log(`- ${q.question}\n  why: ${q.why_it_matters}`);
}
const bad = result.questions.some((q) => /\u2014|\u2013/.test(q.question + q.why_it_matters));
console.log('em dash check:', bad ? 'FAIL' : 'clean');
console.log(
  'verdict:',
  result.restatement && result.questions.length >= 3 && !bad ? 'PASS' : 'FAIL',
);

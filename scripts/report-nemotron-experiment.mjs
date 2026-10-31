import fs from 'node:fs';
import path from 'node:path';
const base = path.resolve('artifacts/nemotron-experiment-2026-10-31');
const read = (name) => JSON.parse(fs.readFileSync(path.join(base, name), 'utf8'));
const summary = read('summary.json');
const verification = read('verification.json');
const audit = read('manual-audit.json');
const results = fs.readFileSync(path.join(base, 'results.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const table = (rows) => [
  '| Requested setting | Accepted actions | Median model service time | Final responses at token limit |',
  '|---|---:|---:|---:|',
  ...rows.map((r) => `| ${r.id} | ${r.valid}/${r.n} | ${r.medianInferenceSeconds.toFixed(2)} seconds | ${r.finalCutoffs} |`),
].join('\n');
const reviewRows = ['t0.1-off', 't0.3-off', 't0.7-off'].map((id) => {
  const rows = results.filter((r) => r.config.id === id && ['review-mixed', 'review-unsupported'].includes(r.task));
  return `| ${id} | ${rows.filter((r) => r.valid).length}/${rows.length} | ${rows.filter((r) => r.valid && r.earned === r.possible).length}/${rows.length} |`;
}).join('\n');
const content = `# Teech: Nemotron 3.5 Super VL configuration experiment

31 October 2026. ${verification.caseRuns} synthetic action runs, ${verification.providerRequests} live OpenRouter inference requests, approximately ${verification.elapsedMinutes.toFixed(0)} minutes. Returned usage reports a total cost of $${summary.cost}. The experiment stayed within its 180-request cap. Production prompts and configuration were not modified.

## Recommendation

Use reasoning off by default. Keep temperature **0.3 for generated lessons, practice questions and answer keys**. A targeted change to **0.1 for Pip's final source-based review** is the most promising temperature adjustment from this small sample. Keep ordinary grading at 0.3/off and clarify the grading instruction described below.

If the app must have only one global setting, retain **temperature 0.3 with reasoning disabled**. This is a quality-first recommendation for a teaching product, not the winner of the delivery-rate table. Temperature 0.7 delivered the fastest and most consistently accepted responses, but its repeated lesson test produced an invalid multiple-choice question and wrong key. Lower temperature 0.1 also produced inconsistent keys. Incorrect assessment keys matter more than a small latency improvement.

Temperature 0.7/off is an exploratory option for planning or conversational wording that does not generate assessment keys. Its tool-planning screening case succeeded where the 0.1/off and 0.3/off cases failed validation, but that is only one tool-planning case per setting. It does not establish broad superiority for planning.

Do not enable reasoning globally under the current budgets and deadlines. Selective review reasoning remains experimental: it sometimes improved the unsupported-versus-contradiction distinction, but an identical repeat timed out.

### Practical profiles

| Task | Temperature | Reasoning | Budget recommendation |
|---|---:|---|---|
| Lesson/practice generation and answer keys | 0.3 | Off | Keep current 6,500-token limit |
| Routine grading | 0.3 | Off | Keep current 1,600-token limit; clarify status instructions |
| Pip final source-based review | 0.1 | Off | Keep current 4,500-token limit; this is a small-sample candidate |
| Other tasks / a single global fallback | 0.3 | Off | Keep current task budgets |
| Optional future planning experiment | 0.7 | Off | Existing budgets; do not apply to key generation based on these results |

These are recommendations, not deployed changes. The app currently still uses its original temperature/reasoning settings.

## What was tested

- Model: \`nvidia/nemotron-3.5-super-vl:free\`, with live catalog verification, zero-price routing, required parameter support and provider fallback disabled.
- Full screening: temperatures 0.1, 0.3 and 0.7 crossed with requested reasoning off, low, medium and high: 12 configurations, six cases each.
- Four initial pilot calls checked whether reasoning controls were accepted and whether nonzero reasoning tokens appeared.
- Screening cases: source extraction with an injected instruction, a six-concept review with supported/omitted/contradictory content, binary-search lesson and keys, correct-answer grading, wrong-answer grading, and tool-assisted current-API planning.
- Confirmation: all three reasoning-off temperatures, seven cases repeated twice: 42 action runs. Five cases were held out from initial screening; the mixed review and lesson generation were repeated screening cases.
- Held-out cases: a deliberately faulty answer key with a correct learner answer, an omission question, insufficient notes, an out-of-scope clarification requesting practice answers, and a review containing an unsupported numerical claim.
- Headroom diagnostic: 0.7/medium repeated the six screening cases with an extra 2,048 output tokens per inference.
- Separate prompt probe: four runs at 0.3/off with explicit grading-status wording. These results are not mixed into the temperature comparisons.
- Separate reasoning probe: two repeats of the unsupported-claim review at 0.1/requested-low with a 6,548-token output budget. One passed all checks and one timed out.

The harness calls the real production AI functions and their validators. Database writes/admission are local no-write fixtures. Keenable returns a constant synthetic documentation excerpt. This isolates model/tool behavior; it does not test real search quality or a full persisted learner session. Notes and learner answers are synthetic. All 12 initial prompt hashes matched for each screening task. The five production AI/domain source hashes remained unchanged through completion.

## Delivery measurements

Accepted means the app returned a validated action result within its current rules. It does **not** mean the teaching content or key was factually correct. Service time sums actual OpenRouter request/body duration per action, including repairs and model tool turns. It excludes experiment admission waits and real database/search overhead.

### Full initial screening

${table(summary.screen)}

### Reasoning-off settings, screening plus repeated confirmation

All three profiles saw the same 20 action cases: six initial cases and 14 repeated confirmation cases.

${table(summary.offCombined)}

The speed and acceptance advantage of 0.7/off is real in this batch. It is insufficient to select a teaching configuration without checking the generated keys. One timeout at 0.3/off may reflect transient shared-provider conditions; this experiment cannot establish that temperature caused that network/body timeout.

## Content audit: the reason acceptance alone is insufficient

I manually inspected arithmetic, worked traces, selected MCQ choices and application keys in **all 13 accepted generated binary-search lessons**. This was an agent inspection, not a blinded independent expert review. The findings are recorded in \`manual-audit.json\`.

| Reasoning-off setting | Lessons inspected | Lessons with a detected key inconsistency | Median lesson service time |
|---|---:|---:|---:|
| 0.1/off | 3 | 2 | 14.00 seconds |
| 0.3/off | 3 | 0 | 20.58 seconds |
| 0.7/off | 3 | 1 | 13.82 seconds |

Examples:

- **0.1/off, initial lesson:** for target 6 in [2,4,7,9,11], the selected correct answer kept [3,4], while the written solution correctly derived [0,1].
- **0.1/off, repeated lesson:** an application expectedAnswer listed middle indices 2,4,3 for an absent target 7, while the solution correctly used 2,0,1.
- **0.7/off, repeated lesson:** an MCQ selected the wrong half; the near-correct alternative also contradicted its own interval update. The written solution gave the correct result, so changing only the selected key would not completely fix the question.
- **0.3/medium:** one accepted lesson's solution ended mid-sentence at the token limit. A nonempty string satisfied the schema, but the solution was incomplete.

No detected inconsistency in three 0.3/off lessons is not proof of a low real-world error rate. It is the strongest observed key-consistency result among the tested reasoning-off temperatures. The fixed regex rubric missed several key errors and produced at least one false negative on a correct numerical update. Its percentages are diagnostic proxies, not model accuracy scores; the manual audit takes precedence for these specific findings.

## Source-based review quality

Across the mixed review and unsupported-claim review, there were five cases per reasoning-off temperature. The checks cover concept classification and exact quotations, not every aspect of prose quality.

| Setting | Accepted reviews | Reviews meeting every predefined content/evidence check |
|---|---:|---:|
${reviewRows}

This is the basis for trying 0.1/off on final review rather than lowering temperature across the whole app. It remains a narrow result on water-cycle material.

The held-out numerical claim was: “Exactly 63% of rainwater infiltrates into the soil.” The source says only that some water infiltrates; it gives no percentage. That makes 63% **unsupported**, not contradicted by the source. Multiple runs at every reasoning-off temperature nevertheless classified it as a contradiction. Temperature changes do not reliably solve this policy distinction.

The 0.1/requested-low reasoning probe with 6,548 tokens handled this distinction correctly with exact evidence in **37.08 seconds**, using 4,927 reported reasoning tokens. The identical repeat hit the **80-second inference timeout**. Earlier, 0.1/low handled the mixed review correctly after a repair in 60.71 seconds under the original budget. This is promising quality evidence for selective reasoning, but too slow and inconsistent to recommend as the default review path from this batch.

## Reasoning and larger budgets

The pilot's four correct-answer grading runs all returned Correct. Reasoning off used zero reasoning tokens and about one second of model service time; enabled reasoning used roughly 970–1,225 reasoning tokens and several additional seconds. The later, harder tasks exposed the practical cost of those tokens sharing the final-output cap.

The strongest general reasoning-enabled screening setting, 0.7/medium, accepted 5/6 cases with median service time 19.59 seconds. The same setting with 2,048 extra tokens accepted 5/6, with median service time 36.92 seconds. Its lesson timed out; its mixed review took 88.18 seconds across two calls and still had an invalid source quotation. Extra output room did not establish a better overall balance.

OpenRouter accepted the requested low/medium/high payloads and returned reasoning tokens. However, this model's catalog entry did not advertise supported effort values. NVIDIA documents native off, regular and medium-effort modes. API acceptance does not prove low/medium/high map to three distinct native modes, so these are comparisons of requested API payloads, not verified internal effort tiers. The on/off distinction was observable.

Official references: [OpenRouter reasoning controls](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [NVIDIA model modes](https://docs.nvidia.com/nemotron/latest/nemotron/super35/README.html), [live free-variant endpoints](https://openrouter.ai/api/v1/models/nvidia/nemotron-3.5-super-vl:free/endpoints).

## Prompt issue worth fixing before broader parameter changes

The current grading instruction says “If flawed, ambiguous, unsupported or not reliably assessable, return Could not assess reliably,” without explicitly identifying what may be flawed. On the deliberately wrong binary-search answer, every accepted initial screening response chose Could not assess reliably while correctly explaining the student's mistake. A clearly wrong but assessable answer should instead receive Partly correct or Needs another try.

A separate clarification of that referent at 0.3/off returned Needs another try in **both** repeated wrong-answer probes, without enabling reasoning. The two bad-key probes also fairly accepted the correct learner answer, but did not explicitly flag the wrong key as requested; this was not perfect instruction adherence. This targeted probe supports a prompt fix, not a claim that all grading problems are solved.

The injected clarification was:

> Assessment-target clarification: 'flawed, ambiguous, unsupported or not reliably assessable' refers to the question or reference key, not merely to a student's incorrect answer. A clearly wrong but assessable learner answer must receive Needs another try or Partly correct, never Could not assess reliably. A fully correct answer must receive Correct. If the supplied reference key is wrong, identify the conflict and use Could not assess reliably; do not penalize a correct learner for a bad key.

The other priority is checking consistency between choices, selected correct choice, expectedAnswer and solution. Current package validation checks identifiers and structure but cannot establish mathematical correctness. The experiment found actual inconsistencies that it accepted. Changing temperature is insufficient protection.

## Limits and verification

- This is a small, adaptively selected synthetic benchmark, not a statistically established global optimum or production reliability estimate. Subjects were water-cycle science, binary search, fractions and one metadata-planning task.
- Confirmation adds repeated cases, not 20 independent subjects per temperature. The two hard screening tasks reused during confirmation are not held-out evidence.
- Shared free-provider load can change latency. The headroom and prompt probes ran after screening and are exploratory, not contemporaneous randomized trials.
- Schema-constrained output can be valid JSON while its text or key is wrong. Source warnings are sometimes returned rather than rejecting the action.
- Failed/timed-out responses have no returned token usage; reported token totals undercount any work that continued after cancellation. The raw legacy firstPass field is a heuristic and is not used for the reported comparison; the tables use the unambiguous one-inference count instead.
- No paid model or paid fallback was used. Returned usage reports $0. The account snapshot at completion showed ${verification.endingAccountQuota.used} free-model requests used and ${verification.endingAccountQuota.remaining} remaining out of ${verification.endingAccountQuota.limit}; provider counters need not exactly equal this harness's own call count.
- Source hashes are unchanged, run IDs are unique, all initial prompt hashes matched across settings, and the ${verification.providerRequests} calls stayed within the 180-call cap. Benchmark script syntax and focused lint were checked separately.

Files: \`calls.jsonl\` contains visible provider responses and usage; \`results.jsonl\` contains per-case app outcomes and checks; \`manual-audit.json\` records inspected content; \`summary.json\` contains aggregates; \`verification.json\` records the final checks. Keys, authorization headers and raw provider hidden reasoning were not saved.
`;
fs.writeFileSync(path.join(base, 'report.md'), content);
fs.writeFileSync(path.join(base, 'measurements.md'), `# Measurements\n\n${summary.jobs} action runs; ${summary.calls} live requests; reported cost $${summary.cost}. Accepted means app validation, not factual correctness. Read report.md and manual-audit.json before interpreting the tables.\n\n## Screening\n\n${table(summary.screen)}\n\n## Reasoning-off combined\n\n${table(summary.offCombined)}\n\n## Confirmation only\n\n${table(summary.confirmation)}\n\n## Extra token headroom\n\n${table(summary.roomy)}\n\n## Focused reasoning probe\n\n${table(summary.reasonProbe)}\n\nDurations exclude harness pacing and real database/search overhead. Cases are small and synthetic; repeated cases are not independent subjects. Timeout token usage is unavailable.\n`);
console.log(JSON.stringify({ report: path.join(base, 'report.md'), caseRuns: results.length, providerCalls: summary.calls, auditedUnitCount: audit.entries.filter((x) => x.runId.endsWith(':unit-binary-search')).length }));

import fs from 'node:fs';
import path from 'node:path';
const base = path.resolve('artifacts/nemotron-experiment-2026-10-31');
const read = (name) => fs.existsSync(path.join(base, name)) ? fs.readFileSync(path.join(base, name), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const results = read('results.jsonl');
const calls = read('calls.jsonl');
const median = (x) => { const a = [...x].sort((a,b) => a-b); const n = a.length; return !n ? null : n % 2 ? a[(n-1)/2] : (a[n/2-1] + a[n/2])/2; };
const mean = (a) => a.length ? a.reduce((s,x) => s+x,0)/a.length : null;
function summarize(rows) {
  return [...new Set(rows.map((r) => r.config.id))].map((id) => {
    const group = rows.filter((r) => r.config.id === id);
    const network = group.map((r) => r.inferenceMs);
    const networkSorted = [...network].sort((a,b) => a-b);
    return { id, n: group.length, valid: group.filter((r) => r.valid).length, singleInference: group.filter((r) => r.calls === 1).length,
      allChecks: group.filter((r) => r.valid && r.earned === r.possible).length,
      finalCutoffs: group.filter((r) => calls.filter((c) => c.runId === r.runId).at(-1)?.finishReason === 'length').length,
      missingUsageCalls: calls.filter((c) => group.some((r) => r.runId === c.runId) && !c.usage).length,
      rubricPercent: 100 * mean(group.map((r) => r.valid ? r.earned / r.possible : 0)),
      medianInferenceSeconds: median(network)/1000,
      p90InferenceSeconds: networkSorted[Math.ceil(networkSorted.length*.9)-1]/1000,
      meanCompletionTokens: mean(group.map((r) => r.completionTokens)),
      meanReasoningTokens: mean(group.map((r) => r.reasoningTokens)),
      providerCalls: group.reduce((s,r) => s+r.calls,0),
      failures: group.filter((r) => !r.valid).map((r) => ({ task:r.task,error:r.error })),
      missedChecks: group.filter((r) => r.valid && r.earned<r.possible).map((r) => ({ task:r.task,checks:r.checks.filter((c) => !c.pass).map((c) => c.label) })),
    };
  }).sort((a,b) => b.valid/b.n-a.valid/a.n || b.rubricPercent-a.rubricPercent || a.medianInferenceSeconds-b.medianInferenceSeconds);
}
const summary = { generatedAt: new Date().toISOString(), jobs: results.length, calls: calls.length,
  cost: calls.reduce((s,c) => s+(c.usage?.cost||0),0),
  screen: summarize(results.filter((r) => r.round === 'screen')),
  roomy: summarize(results.filter((r) => r.round === 'roomy')),
  promptProbe: summarize(results.filter((r) => r.round.startsWith('prompt-probe'))),
  reasonProbe: summarize(results.filter((r) => r.round.startsWith('reason-probe'))),
  offCombined: summarize(results.filter((r) => (r.round === 'screen' || r.round.startsWith('confirm')) && r.config.effort === 'off')),
  confirmation: summarize(results.filter((r) => r.round.startsWith('confirm'))),
  byTask: [...new Set(results.map((r) => r.task))].map((task) => ({ task, configurations: summarize(results.filter((r) => r.task === task && r.round !== 'pilot')) })),
  transportErrors: calls.filter((c) => c.status !== 200).map((c) => ({ config:c.config,task:c.task,status:c.status,error:c.error })),
  truncations: calls.filter((c) => c.finishReason === 'length').map((c) => ({ config:c.config,task:c.task,usage:c.usage })),
  promptHashCheck: [...new Set(results.filter((r) => r.round === 'screen').map((r) => r.task))].map((task) => {
    const first = results.filter((r) => r.round === 'screen' && r.task === task).map((r) => calls.find((c) => c.runId === r.runId)?.promptHash).filter(Boolean);
    return { task,firstPrompts:first.length,distinctHashes:new Set(first).size };
  }),
};
fs.writeFileSync(path.join(base,'summary.json'), JSON.stringify(summary,null,2));
const table = (rows) => ['| Setting | Cases | Valid | One inference | Rubric checks | Median service time | Reported output tokens/case | Reported reasoning tokens/case |', '|---|---:|---:|---:|---:|---:|---:|---:|', ...rows.map((r) => `| ${r.id} | ${r.n} | ${r.valid}/${r.n} | ${r.singleInference}/${r.n} | ${r.rubricPercent.toFixed(1)}% | ${r.medianInferenceSeconds.toFixed(2)}s | ${r.meanCompletionTokens.toFixed(0)} | ${r.meanReasoningTokens.toFixed(0)} |`)].join('\n');
fs.writeFileSync(path.join(base,'measurements.md'), `# Nemotron experiment measurements\n\n${summary.generatedAt}\n\n${summary.jobs} synthetic case runs, ${summary.calls} live OpenRouter inference requests. Reported provider cost: $${summary.cost}.\n\n## Screening\n\n${table(summary.screen)}\n\n## Confirmation\n\n${table(summary.confirmation)}\n\n## Interpretation limits\n\n- These are small, deliberately chosen synthetic cases, not a population accuracy benchmark.\n- Rubric checks are predefined deterministic proxies, macro-averaged per case; failed actions score zero. Schema acceptance alone is not factual correctness.\n- Service time sums actual OpenRouter network/body durations per action, including repairs and model tool turns. It excludes harness admission waits, real database work and real Keenable latency.\n- Search responses are fixed synthetic official-documentation excerpts; this experiment measures tool selection and use, not search quality.\n- Main screening and confirmation retain production output caps. Diagnostic runs explicitly marked roomy add 2,048 tokens and are interpreted separately.\n- Effort settings are accepted by the API, but the catalog does not advertise selectable effort levels. Acceptance and nonzero reasoning tokens do not prove low/medium/high map to distinct underlying modes.\n- Raw provider hidden reasoning and credentials are not saved.\n`);
console.log(JSON.stringify({jobs:summary.jobs,calls:summary.calls,cost:summary.cost,screen:summary.screen,confirmation:summary.confirmation,transportErrors:summary.transportErrors,truncations:summary.truncations.length,promptHashCheck:summary.promptHashCheck},null,2));

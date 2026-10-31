import fs from 'node:fs';
import path from 'node:path';
const base=path.resolve('artifacts/nemotron-fine-experiment-2026-10-31');
const read=(name)=>JSON.parse(fs.readFileSync(path.join(base,name),'utf8'));
const summary=read('summary.json');
const audit=read('audit-summary.json');
const manifest=read('manifest.json');
const verification=read('verification.json');
if(!summary.completeGrid||!audit.complete||Object.values(verification.checks).some((x)=>!x))throw new Error('Incomplete experiment or verification');
const rows=(data)=>data.map((r)=>`| ${r.id} | ${r.accepted}/${r.n} | ${r.cleanCases}/${r.n} | ${r.medianServiceSeconds.toFixed(2)}s | ${r.cutoffs} |`).join('\n');
const table=(data)=>`| Requested configuration | App accepted | Narrow checks passed | Median service time | Final token cutoffs |\n|---|---:|---:|---:|---:|\n${rows(data)}`;
const modeRows=manifest.configurations.map((m)=>{
  const data=summary.screen.filter((r)=>r.mode===m.mode);
  return `| ${m.mode} | ${m.omitReasoning?'Omitted':JSON.stringify(m.reasoning)} | ${data.reduce((s,r)=>s+r.accepted,0)}/22 | ${data.reduce((s,r)=>s+r.cleanCases,0)}/22 |`;
}).join('\n');
const lessonRows=summary.validation.map((r)=>{
  const a=audit.configurations.find((x)=>x.config===r.id)?.stages['fine-validate'];
  return `| ${r.id} | ${a?.accepted||0}/4 | ${a?.inspected||0} | ${a?.keyErrors||0} | ${a?.otherContentIssues||0} |`;
}).join('\n');
const confirmationAudit=summary.production.map((r)=>{
  const a=audit.configurations.find((x)=>x.config===r.id).stages['fine-production'];
  return `| ${r.id} | ${a.accepted}/4 | ${a.keyErrors} | ${a.otherContentIssues} |`;
}).join('\n');
const report=`# Nemotron 3.5 Super VL: fine temperature and reasoning experiment

Completed 31 October 2026. Model: \`${summary.model}\`, OpenRouter free endpoint, served by Nvidia.

## Recommendation

Use **temperature 0.1 with \`reasoning: {"effort":"none"}\` as the next default candidate** if optimizing the existing app for speed and response reliability. Keep the existing output budgets, free-only routing and timeouts. This recommendation replaces the earlier coarse experiment's conservative global 0.3/off choice; the earlier report remains as historical evidence.

The candidate returned accepted responses in 14/14 broader actions and 8/8 unseeded confirmation actions. Current 0.3/off returned 13/14 and 7/8. The candidate was also the fastest configuration passing both short screening cases. These are small synthetic samples, so the observed delivery advantage does not establish a statistically reliable production improvement or superior mathematical accuracy.

**Neither setting passed every content check.** Across broader and unseeded runs, 0.1/none had one lesson with an incorrect key among eight accepted lessons; 0.3/off had one among seven. Each also had a separate misleading teaching statement. The production-like unseeded subset alone had one key-error lesson out of four at each setting. Changing temperature and reasoning cannot be presented as fixing answer-key reliability. No production setting was changed.

Exact tested candidate request fields:

\`\`\`json
{
  "model": "nvidia/nemotron-3.5-super-vl:free",
  "temperature": 0.1,
  "reasoning": { "effort": "none" },
  "provider": {
    "require_parameters": true,
    "allow_fallbacks": false,
    "max_price": { "prompt": 0, "completion": 0 }
  }
}
\`\`\`

This is a configuration fragment; retain the actual task messages, response schema and task-specific max_tokens. The unseeded confirmation omitted seed, matching production. Do not infer that 0.1/none beats an untested 0.1/off in the same broader task mix; off and none both reported zero reasoning tokens here.

## Complete requested grid

Temperatures: **0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0**. Ten reasoning request forms at each temperature give **110 configurations**, each screened on two cases: 220 actions. Every cell is complete. The seven effort labels are none, minimal, low, medium, high, xhigh and max; explicit off, explicit on/default effort and omitted/provider default were also tested.

| Request label | Reasoning payload | App accepted over 11 temperatures | Narrow checks passed |
|---|---|---:|---:|
${modeRows}

All ten forms returned HTTP 200 in a separate capability probe at 0.3. That proves gateway acceptance only. The captured model catalog exposes reasoning as optional but omits supported_efforts, so it does not establish distinct native levels or a mapping of each label. [OpenRouter's reasoning documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) distinguishes omitted effort support from an advertised effort list. [NVIDIA's model documentation](https://docs.nvidia.com/nemotron/latest/nemotron/super35/README.html) names reasoning-off, regular and medium-effort modes. This experiment cannot prove that every native NVIDIA mode is reachable through a distinct OpenRouter effort label. No direct native-endpoint comparison was performed.

Off and none reported zero reasoning tokens. Other forms reported reasoning tokens, but counts were not monotonic with the requested effort. Omitting reasoning enabled reasoning in the capability response. Excluding returned reasoning text is a visibility control, not an additional reasoning level, and was not treated as a separate mode.

![Full temperature and reasoning screen](temperature-reasoning-grid.png)

## Broader comparison of seven configurations

Each received 14 actions: seven task types repeated twice. Six finalists were selected after the complete screen, including current 0.3/off, several fast no-reasoning alternatives and two reasoning-enabled profiles that passed both short cases. A seventh, 0.7/on-default, was added because explicit-on had the most consistent short-screen checks across temperatures. This adaptive choice means broader results do not constitute an exhaustive ranking of all 110 configurations.

${table(summary.validation)}

These checks include task-specific schema, status, evidence and coverage rules. They are **not accuracy percentages**. Unit checks do not prove mathematical correctness; the separate content audit below takes precedence.

Reasoning enabled often performed well on the short screen but did not fit larger tasks under the existing budgets. At 0.7/on-default only 6/14 broader actions were accepted and none of its four lesson attempts succeeded. At 0.0/medium and 1.0/low, only 7/14 actions were accepted. Failures included token exhaustion, validation failures and timeouts. No output budgets were increased for these fine comparisons.

## Unseeded confirmation

The two leading practical defaults received eight further actions each: binary-search lesson, proportions lesson, source-based unsupported-claim review and correct-answer grading, repeated twice, without a seed. These use the actual app prompts and budgets; database/search overhead is still fixture-controlled.

${table(summary.production)}

The baseline's one failure was a source review rejected after validation/repair. Median service times differ by only about 0.33 seconds in this small subset; that is insufficient evidence of a real latency gain. Response acceptance must be assessed separately from content correctness.

## Content audit of every accepted generated lesson

I inspected all **${audit.assessed} accepted lessons** from broader validation and unseeded confirmation. Configuration labels were omitted from stable, hash-ordered packets during inspection and revealed afterward. The same coding agent performed this audit; it is not an independent expert evaluation. I checked arithmetic, binary-search traces, question uniqueness, selected choices, expected answers, rubrics and agreement with worked solutions. A lesson is counted once per issue category even if it contains several wrong keys. Failures before app acceptance are reported separately and cannot count as correct lessons.

Seeded broader validation:

| Configuration | Accepted lesson attempts | Inspected | Lessons with wrong/invalid keys | Other material teaching issues |
|---|---:|---:|---:|---:|
${lessonRows}

Unseeded confirmation:

| Configuration | Accepted lesson attempts | Lessons with wrong/invalid keys | Other material teaching issues |
|---|---:|---:|---:|
${confirmationAudit}

Examples explaining why schema acceptance is insufficient:

- **0.1/none, unseeded:** 40 oranges, one quarter bruised and 30% ripe, asking how many are neither. Overlap was unspecified, so no unique answer exists. Even assuming disjoint groups, the solution computed 18 while expectedAnswer said 14.
- **0.3/off, unseeded:** a binary-search question gave [2,5,8,12] but asserted list[1]=8. Target 5 is already at middle index 1; its selected key discarded that position and none of the choices offered stop/found.
- **0.0/off:** three of four accepted lessons had wrong keys, including 20% removed from 50 keyed as 30 remaining while the solution correctly computed 40.
- **0.5/off:** a lesson keyed floor((3+6)/2) as 5 while its solution computed 4, and keyed the wrong half to discard in a second question.
- The separate teaching issues at 0.1/none and 0.3/off concerned a missing percent unit and a false exception about removed versus remaining quantities, respectively. Concrete keys in those two lessons were correct.

The two reasoning-enabled candidates had no detected key errors in their two accepted lessons each, but both failed the other two lesson attempts. Those surviving outputs were proportions lessons; they provide no successful binary-search lesson comparison. This is insufficient evidence to recommend reasoning enabled for general lesson generation.

## Remaining project-specific issues

Wrong-answer grading often chose Could not assess reliably instead of Partly correct/Needs another try. The existing prompt does not clearly specify whether “flawed” refers to the question/key or the learner answer. The fine experiment used that prompt unchanged. Earlier targeted prompt probes are documented separately in the coarse report; they are not pooled into this grid.

Some reviews still treated a source-unsupported numerical claim as contradicted. Changing temperature did not reliably settle that distinction. The new fictional four-way screen tested the distinction directly, while broader validation used a separate water-cycle example.

Prioritize fixing and re-evaluating the grading instruction and verifying generated keys before relying on them for assessment. Several wrong keys contradicted a correct solution generated in the same response. A future solution-first schema or an independent consistency check is a hypothesis to test, not a proven fix from this experiment.

## Method and limits

- Actual server AI functions, prompts, JSON schemas and validators were loaded from the checkout. Five core source hashes match the initial manifest. No app source, production configuration, database or learner state was changed.
- Cases use synthetic notes and learner answers. Keenable replies are a constant synthetic documentation snippet; no live search requests were made. Tool choice and model follow-up were exercised, but these results do not evaluate Keenable search quality, latency or rate limits.
- Short screen: fictional source review covering supported, contradiction, unsupported and omitted claims with exact quotes, plus correct-answer binary-search grading. Each task's initial prompt hash matched across all 110 settings.
- Broader tasks: binary-search and fraction/percentage lesson generation, separate unsupported-claim review, extraction with a prompt-injection sentence, tool-assisted planning with fixed search evidence, wrong-answer grading and insufficient notes. Second lesson repeats varied the learner goal to request fresh examples.
- Screen requested seed 314159; broader repeats requested 314160 and 314161. These do not make provider output deterministic: an identical seeded grading request at 0.3/max returned different statuses between capability and screening phases. Unseeded confirmation removes that production mismatch but remains small.
- Configurations were stably randomized within screening task blocks and rotated within broader task blocks. Runs share one provider over time; transient load, caching and timeout variation can affect results. The design does not isolate temperature as the cause of network failures.
- Only text workloads were evaluated. No image, document-image or video input was tested despite the model's VL capabilities. No human classroom outcomes or multi-day reliability were measured.
- Existing token budgets retained: grading 1,600; lessons 6,500; source evaluation 4,500; extraction 2,200. Per-inference timeouts remain 40/70/80 seconds by task family, with a 105-second active action budget.
- Service time sums actual OpenRouter network/body time, including repair and model tool turns, and excludes artificial admission waits. It is not end-to-end user latency: real database and search overhead are absent. The transport enforces active budgets separately so experiment pacing does not consume inference time.
- The grid provides two screening cases per configuration, not repeated accuracy estimates. Larger validation covers seven settings, with unseeded checks only for two. There is no statistically established global optimum.

## Request accounting and verification

${summary.caseRuns} actions: 10 capability probes, 220 full-grid actions, 98 broader actions and 16 unseeded actions. **${summary.liveRequests} provider-request attempts** including repairs and tool turns, within the 500-request experiment cap. ${verification.http200} returned HTTP 200; ${verification.noResponse} had no HTTP response before cancellation/connection failure. All recorded returned costs sum to **$0**; cancelled requests have no usage record, so recorded token totals omit any unreturned work.

The harness admitted at most one new request every five seconds (12/minute), with four concurrent case workers. This is experiment pacing, not a newly configured production limit or a measured maximum provider capacity. Free-only allowlisting, disabled fallback and zero-price routing were retained.

Account allowance started at ${manifest.initialAccountQuota.remaining}/${manifest.initialAccountQuota.limit} requests remaining and ended at ${verification.quota.remaining}/${verification.quota.limit}. The provider's daily usage meter increased by ${verification.quota.used-manifest.initialAccountQuota.used}, versus ${summary.liveRequests} locally logged attempts; cancellation/metering semantics were not resolved. No HTTP 429 was returned in this experiment. That does not establish an unlimited or sustained safe production rate.

Verification passed: complete 110-cell grid, unique run IDs, matching initial screening prompts, unchanged core source hashes, omitted seed on every confirmation call, all accepted lessons audited, zero reported cost, request cap respected, no stored hidden-reasoning fields and no configured credential values found in the recorded text artifacts. JavaScript syntax and focused ESLint passed for the experiment, summary and audit scripts; the plotting script parsed and its rendered grid was visually inspected. The report generator was checked separately after creation. No app build was necessary because app code was not changed.

## Evidence files

- [Full 110-configuration measurements](measurements.md)
- [Raw visible call records](calls.jsonl) and [case results](results.jsonl)
- [Model/catalog metadata, allowance and source hashes](manifest.json)
- [Per-lesson audit assessments](audit-assessments.json), [label mapping](audit-mapping.json) and [audit totals](audit-summary.json)
- [Verification and ending allowance](verification.json)
- [Full grid PNG](temperature-reasoning-grid.png) and [SVG](temperature-reasoning-grid.svg)

The earlier coarse experiment is preserved in the sibling nemotron-experiment-2026-10-31 folder and is not pooled into these measurements.
`;
fs.writeFileSync(path.join(base,'report.md'),report);
console.log(JSON.stringify({report:path.join(base,'report.md'),characters:report.length}));

import fs from 'node:fs';
import path from 'node:path';
const base = path.resolve('artifacts/nemotron-fine-experiment-2026-10-31');
const read = (name) => fs.existsSync(path.join(base,name)) ? fs.readFileSync(path.join(base,name),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const results = read('results.jsonl');
const calls = read('calls.jsonl');
const manifest = JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
const modes = manifest.configurations.map((m) => m.mode);
const median = (values) => { const a=[...values].sort((a,b)=>a-b); return !a.length?null:a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2; };
const average = (values) => values.length?values.reduce((s,v)=>s+v,0)/values.length:null;
const expected = { hourly:'supported',retention:'contradiction',identifier:'unsupported',alerts:'omitted' };
const isCutoff = (r) => calls.filter((c)=>c.runId===r.runId).at(-1)?.finishReason==='length';
function clean(r) {
  if (!r.valid || isCutoff(r)) return false;
  if (r.task === 'grade-correct-alternative') return r.output.status==='Correct' && r.output.itemId==='halves_apply';
  return r.earned===r.possible;
}
function grouped(rows) {
  return [...new Set(rows.map((r)=>r.config.id))].map((id)=>{
    const group=rows.filter((r)=>r.config.id===id);
    const records=calls.filter((c)=>group.some((r)=>r.runId===c.runId));
    const output={id,temperature:group[0].config.temperature,mode:group[0].config.mode || group[0].config.effort,n:group.length,accepted:group.filter((r)=>r.valid).length,cleanCases:group.filter(clean).length,cutoffs:group.filter(isCutoff).length,
      medianServiceSeconds:median(group.map((r)=>r.inferenceMs))/1000,medianActiveSeconds:median(group.map((r)=>r.activeMs))/1000,
      calls:records.length,missingUsage:records.filter((c)=>!c.usage).length,meanReportedCompletionTokens:average(group.map((r)=>r.completionTokens)),meanReportedReasoningTokens:average(group.map((r)=>r.reasoningTokens)),
      failures:group.filter((r)=>!r.valid).map((r)=>({task:r.task,error:r.error,status:r.status})),missed:group.filter((r)=>r.valid&&!clean(r)).map((r)=>({task:r.task,checks:r.checks?.filter((c)=>!c.pass).map((c)=>c.label),gradeStatus:r.output?.status,cutoff:isCutoff(r)})),
    };
    const review=group.find((r)=>r.task==='fine-review-four-way');
    if(review)output.fourWay={accepted:review.valid,labels:Object.fromEntries(Object.entries(expected).map(([key,label])=>[key,{expected:label,actual:review.output?.results?.find((x)=>x.conceptId===key)?.claimType || null}])),exactEvidence:review.valid&&review.output.results.every((x)=>!x.evidenceWarning),serviceSeconds:review.inferenceMs/1000};
    return output;
  }).sort((a,b)=>b.cleanCases-a.cleanCases||b.accepted-a.accepted||a.medianServiceSeconds-b.medianServiceSeconds);
}
const screen=grouped(results.filter((r)=>r.round==='fine-screen'));
const capabilities=grouped(results.filter((r)=>r.round==='fine-capabilities'));
const initialCalls=results.filter((r)=>r.round==='fine-screen').map((r)=>calls.find((c)=>c.runId===r.runId)).filter(Boolean);
const coverage=Array.from({length:11},(_,i)=>({temperature:i/10,modes:modes.map((mode)=>({mode,cases:results.filter((r)=>r.round==='fine-screen'&&r.config.temperature===i/10&&r.config.mode===mode).length}))}));
const summary={generatedAt:new Date().toISOString(),model:manifest.model,caseRuns:results.length,reservations:calls.length,liveRequests:calls.filter((c)=>c.sent!==false).length,reportedCost:calls.reduce((s,c)=>s+(c.usage?.cost||0),0),capabilities,screen,validation:grouped(results.filter((r)=>r.round.startsWith('fine-validate'))),production:grouped(results.filter((r)=>r.round.startsWith('fine-production'))),coverage,completeGrid:coverage.every((x)=>x.modes.every((m)=>m.cases===2)),screenDone:results.filter((r)=>r.round==='fine-screen').length,expectedScreen:110*2,
  initialPromptHashes:[...new Set(initialCalls.map((c)=>c.task))].map((task)=>({task,count:initialCalls.filter((c)=>c.task===task).length,distinct:new Set(initialCalls.filter((c)=>c.task===task).map((c)=>c.promptHash)).size})),
  statuses:calls.reduce((o,c)=>(o[c.status]=(o[c.status]||0)+1,o),{}),cutoffCalls:calls.filter((c)=>c.finishReason==='length').length,
};
fs.writeFileSync(path.join(base,'summary.json'),JSON.stringify(summary,null,2));
const table=(rows)=>['| Configuration | Cases | Accepted | Clean checks | Median service | Calls | Final cutoff |','|---|---:|---:|---:|---:|---:|---:|',...rows.map((r)=>`| ${r.id} | ${r.n} | ${r.accepted}/${r.n} | ${r.cleanCases}/${r.n} | ${r.medianServiceSeconds.toFixed(2)}s | ${r.calls} | ${r.cutoffs} |`)].join('\n');
fs.writeFileSync(path.join(base,'measurements.md'),`# Fine temperature/reasoning measurements\n\n${summary.screenDone}/${summary.expectedScreen} screen cases completed. ${summary.caseRuns} total actions; ${summary.liveRequests} logged live requests; reported cost $${summary.reportedCost}.\n\n## Modes probe\n\n${table(capabilities)}\n\n## Screening\n\n${table(screen)}\n\n## Broader validation\n\n${table(summary.validation)}\n\n## Unseeded confirmation using production budgets\n\n${table(summary.production)}\n\nAcceptance means app validation, not verified content. Clean checks are narrow, deterministic case checks and require no final token cutoff; grade status is checked directly rather than using a negation-sensitive regex. Generated math keys require a separate content audit. Network/body duration excludes artificial queue pacing. Token reports omit unavailable usage from timeouts. Modes name requested API payloads, not established native NVIDIA effort tiers.\n`);
console.log(JSON.stringify({screen:summary.screenDone,expected:summary.expectedScreen,requests:summary.liveRequests,completeGrid:summary.completeGrid,best:screen.filter((r)=>r.n===2).slice(0,12),validation:summary.validation},null,2));

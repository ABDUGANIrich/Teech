// Prepare label-hidden content packets, then aggregate explicit human/agent
// assessments. No network calls or model-generated judge scores.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const base=path.resolve('artifacts/nemotron-fine-experiment-2026-10-31');
const results=fs.readFileSync(path.join(base,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const lessons=results.filter((r)=>(r.round.startsWith('fine-validate')||r.round.startsWith('fine-production'))&&r.family==='unit'&&r.valid).sort((a,b)=>crypto.createHash('sha256').update(a.runId).digest('hex').localeCompare(crypto.createHash('sha256').update(b.runId).digest('hex')));
const mapping=lessons.map((r)=>({code:`L-${crypto.createHash('sha256').update(r.runId).digest('hex').slice(0,8)}`,runId:r.runId,config:r.config.id,task:r.task}));
fs.writeFileSync(path.join(base,'audit-mapping.json'),JSON.stringify(mapping,null,2));
const packets=mapping.map((m,i)=>({code:m.code,unit:lessons[i].output.unit,keys:lessons[i].output.keys}));
fs.writeFileSync(path.join(base,'audit-packets.json'),JSON.stringify(packets,null,2));
const assessmentPath=path.join(base,'audit-assessments.json');
if(!fs.existsSync(assessmentPath))fs.writeFileSync(assessmentPath,JSON.stringify({method:'Configuration labels omitted from the packets inspected by the coding agent. This is not an independent expert evaluation. Judge arithmetic, choice uniqueness, selected keys and consistency with worked solutions.',assessments:[]},null,2));
const assessments=JSON.parse(fs.readFileSync(assessmentPath,'utf8')).assessments;
const aggregated=[...new Set(mapping.map((m)=>m.config))].map((config)=>{
  const rows=mapping.filter((m)=>m.config===config);
  const inspected=rows.map((m)=>({...m,assessment:assessments.find((a)=>a.code===m.code)})).filter((m)=>m.assessment);
  const stages={};
  for(const stage of ['fine-validate','fine-production']){
    const attempted=results.filter((r)=>r.config.id===config&&r.family==='unit'&&r.round.startsWith(stage));
    const assessed=inspected.filter((m)=>m.runId.startsWith(stage+ '-'));
    stages[stage]={attempted:attempted.length,accepted:attempted.filter((r)=>r.valid).length,inspected:assessed.length,keyErrors:assessed.filter((m)=>m.assessment.keyError).length,otherContentIssues:assessed.filter((m)=>m.assessment.materialError&&!m.assessment.keyError).length};
  }
  return{config,acceptedLessons:rows.length,inspected:inspected.length,materialErrors:inspected.filter((m)=>m.assessment.materialError).length,keyErrors:inspected.filter((m)=>m.assessment.keyError).length,otherContentIssues:inspected.filter((m)=>m.assessment.materialError&&!m.assessment.keyError).length,stages,issues:inspected.filter((m)=>m.assessment.materialError).map((m)=>({code:m.code,runId:m.runId,keyError:m.assessment.keyError,details:m.assessment.details}))};
});
fs.writeFileSync(path.join(base,'audit-summary.json'),JSON.stringify({packets:packets.length,assessed:assessments.length,complete:packets.length>0&&mapping.every((m)=>assessments.some((a)=>a.code===m.code)),configurations:aggregated},null,2));
console.log(JSON.stringify({packets:packets.length,assessed:assessments.length,configs:aggregated}));

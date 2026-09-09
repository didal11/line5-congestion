from pathlib import Path
import re

path = Path('notion-ide/worker/src/ui.js')
text = path.read_text(encoding='utf-8')

old_vars = 'let config=null,currentSha=null,runCommit=null,runId=null,jobId=null,pollTimer=null,selectedRow=null,currentPath="",lastRunCommand="",lastLifecycle="IDLE",cancelRequested=false;'
new_vars = 'let config=null,currentSha=null,runCommit=null,runId=null,jobId=null,pollTimer=null,selectedRow=null,currentPath="",lastRunCommand="",lastLifecycle="IDLE",cancelRequested=false,liveLogText="",liveLogSeq=0,lastLiveLogFetch=0;'
if text.count(old_vars) != 1:
    raise SystemExit('variable declaration did not match exactly once')
text = text.replace(old_vars, new_vars)

run_reset_old = 'lastRunCommand=await pythonCommand(entrypoint);runCommit=null;runId=null;jobId=null;cancelRequested=false;'
run_reset_new = 'lastRunCommand=await pythonCommand(entrypoint);runCommit=null;runId=null;jobId=null;cancelRequested=false;liveLogText="";liveLogSeq=0;lastLiveLogFetch=0;'
if text.count(run_reset_old) != 1:
    raise SystemExit('run reset did not match exactly once')
text = text.replace(run_reset_old, run_reset_new)

marker = 'function terminalSteps(data){return data.jobs.flatMap(j=>[j.name+" : "+j.status+(j.conclusion?" / "+j.conclusion:""),...j.steps.map(s=>"  "+s.number+". "+s.name+" : "+s.status+(s.conclusion?" / "+s.conclusion:""))]).join("\\n")}\n'
insert = '''async function refreshLiveLog(force=false){if(!runId)return;const now=Date.now();if(!force&&now-lastLiveLogFetch<4500)return;lastLiveLogFetch=now;try{const d=await api("/api/live-log?run_id="+encodeURIComponent(runId),{},false);liveLogSeq=Number(d.seq||0);liveLogText=String(d.tail||"")}catch{}}\nfunction renderRunTerminal(state,run,steps){const live=liveLogText?"\\n\\n--- LIVE LOG · 5s batches ---\\n"+liveLogText:"";setTerminal("$ "+lastRunCommand+"\\n\\nSTATE: "+state+"\\nGitHub status: "+run.status+(run.conclusion?" / "+run.conclusion:"")+(steps?"\\n\\n"+steps:"")+live)}\n'''
if text.count(marker) != 1:
    raise SystemExit('terminalSteps marker did not match exactly once')
text = text.replace(marker, marker + insert)

pattern = r'async function pollRun\(\)\{.*?\}\nasync function cancelRun'
replacement = '''async function pollRun(){if(!runCommit)return;try{const d=await api("/api/run-status?sha="+encodeURIComponent(runCommit));if(!d.found){setRunState("WAITING_FOR_RUN");persistRunSession();setTerminal("$ "+lastRunCommand+"\\n\\nSTATE: WAITING_FOR_RUN\\nRequest commit: "+runCommit.slice(0,8)+"\\nGitHub Actions has not created the run yet.");updateRunButton();pollTimer=setTimeout(pollRun,3000);return}runId=d.run.id;jobId=d.jobs[0]?.id||null;persistRunSession();const actual=lifecycleFromRun(d.run);const state=cancelRequested&&d.run.status!=="completed"?"CANCEL_REQUESTED · "+actual:actual;setRunState(state);$("runLink").innerHTML="<a target='_blank' rel='noreferrer' href='"+d.run.html_url+"'>run "+d.run.id+"</a>";const steps=terminalSteps(d);await refreshLiveLog(d.run.status==="completed");renderRunTerminal(state,d.run,steps);updateRunButton();if(d.run.status!=="completed"){pollTimer=setTimeout(pollRun,3000)}else{$("cancelRun").disabled=true;$("loadLog").disabled=!jobId;await loadArtifacts();if(jobId)await loadLog();clearRunSession();updateRunButton()}}catch(e){setRunState("IDE_ERROR");appendTerminal("[IDE ERROR] "+friendlyError(e)+"\\n[RETRYING] status check in 7 seconds");updateRunButton();pollTimer=setTimeout(pollRun,7000)}}\nasync function cancelRun'''
text, count = re.subn(pattern, lambda _: replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'pollRun replacement count={count}')

path.write_text(text, encoding='utf-8')
print('patched', path)

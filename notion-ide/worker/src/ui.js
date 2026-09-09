export const UI = String.raw`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Python Workspace</title>
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;font-size:14px;color:#111;background:#fff}button,input,select,textarea{font:inherit;color:#111;background:#fff;border:1px solid #999;border-radius:0}button{padding:6px 10px;cursor:pointer}button:disabled{cursor:default;color:#888}input,select{padding:6px}header{height:44px;padding:6px 8px;border-bottom:1px solid #aaa;display:flex;gap:8px;align-items:center;white-space:nowrap;overflow:auto}.grow{flex:1}.muted{color:#666}.error{color:#900;white-space:pre-wrap}.workspace{display:grid;grid-template-columns:260px minmax(520px,1fr);height:590px;border-bottom:1px solid #aaa}.explorer{border-right:1px solid #aaa;overflow:auto}.pane-title{height:34px;padding:8px;border-bottom:1px solid #bbb;font-weight:600}.tree{padding:4px 0;font-family:Consolas,monospace;font-size:13px}.tree-row{height:26px;display:flex;align-items:center;gap:3px;padding-right:6px;cursor:pointer;white-space:nowrap}.tree-row:hover,.tree-row.selected{background:#eee}.twisty{width:18px;text-align:center;flex:0 0 18px}.tree-name{overflow:hidden;text-overflow:ellipsis}.editor-pane{display:grid;grid-template-rows:34px 1fr 38px;min-width:0}.editor-head{display:flex;align-items:center;gap:6px;padding:4px 6px;border-bottom:1px solid #bbb}.editor-head input{min-width:0;flex:1;border:0;padding:4px 6px}.editor-head input:focus{outline:1px solid #999}.editor{width:100%;height:100%;min-height:0;padding:10px;border:0;resize:none;outline:0;font-family:Consolas,monospace;font-size:13px;line-height:1.5;tab-size:4;white-space:pre}.editor-foot{display:flex;align-items:center;gap:8px;padding:4px 6px;border-top:1px solid #bbb}.runner{display:grid;grid-template-columns:360px minmax(0,1fr);min-height:250px}.run-panel{border-right:1px solid #aaa;padding:8px}.run-row{display:flex;gap:6px;align-items:center;margin-bottom:8px}.run-row input,.run-row select{min-width:0;flex:1}.status-grid{display:grid;grid-template-columns:72px 1fr;gap:5px;font-size:13px}.steps{margin-top:8px;border-top:1px solid #ccc;padding-top:6px;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px}.result-panel{display:grid;grid-template-rows:34px minmax(180px,1fr)}.result-head{display:flex;align-items:center;gap:8px;padding:4px 6px;border-bottom:1px solid #bbb}.result{margin:0;padding:8px;overflow:auto;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px;background:#fff}.connection-error{padding:4px 8px;border-top:1px solid #bbb}.hidden{display:none}@media(max-width:760px){.workspace{grid-template-columns:220px minmax(500px,1fr)}.runner{grid-template-columns:300px minmax(420px,1fr)}}
</style>
</head>
<body>
<header>
<label>Key <input id="key" type="password" autocomplete="current-password"></label>
<button id="connect">Connect</button>
<span id="connection" class="muted">disconnected</span>
<span class="grow"></span>
<span id="repoLabel" class="muted"></span>
</header>

<div class="workspace">
<aside class="explorer">
<div class="pane-title">EXPLORER</div>
<div id="tree" class="tree"></div>
</aside>

<section class="editor-pane">
<div class="editor-head">
<input id="path" placeholder="select a file">
<button id="newFile">New</button>
</div>
<textarea id="editor" class="editor" spellcheck="false"></textarea>
<div class="editor-foot">
<button id="save">Save</button>
<span id="saveState" class="muted">no file selected</span>
</div>
</section>
</div>

<div class="runner">
<section class="run-panel">
<div class="pane-title" style="margin:-8px -8px 8px">RUN</div>
<div class="run-row"><span>Target</span><select id="target"><option value="github-hosted">GitHub Hosted</option><option disabled>Local PC (later)</option></select></div>
<div class="run-row"><span>Entrypoint</span><input id="entrypoint" value="src.train"><button id="run">Run</button></div>
<div class="status-grid">
<div>Status</div><div id="runStatus">-</div>
<div>Run</div><div id="runLink">-</div>
<div>Commit</div><div id="runSha">-</div>
</div>
<div id="steps" class="steps"></div>
</section>

<section class="result-panel">
<div class="result-head"><strong>RESULT</strong><button id="loadLog" disabled>Load log</button><span id="artifactLinks"></span></div>
<pre id="result" class="result"></pre>
</section>
</div>
<div id="error" class="connection-error error hidden"></div>

<script>
const $=id=>document.getElementById(id);
let config=null,currentSha=null,runCommit=null,runId=null,jobId=null,pollTimer=null,selectedRow=null;
const loadedDirs=new Map();
function apiHeaders(jsonBody=false){const h={"x-ide-key":$("key").value};if(jsonBody)h["content-type"]="application/json";return h}
async function api(path,options={}){options.headers={...apiHeaders(Boolean(options.body)),...(options.headers||{})};const r=await fetch(path,options);const t=await r.text();let data=t;try{data=JSON.parse(t)}catch{}if(!r.ok)throw new Error(typeof data==="string"?data:JSON.stringify(data,null,2));return data}
function showError(e){const box=$("error");box.textContent=e?String(e.message||e):"";box.classList.toggle("hidden",!e)}
function setSelected(row){if(selectedRow)selectedRow.classList.remove("selected");selectedRow=row;if(row)row.classList.add("selected")}
async function connect(){showError();config=await api("/api/bootstrap",{method:"POST"});sessionStorage.setItem("notionIdeKey",$("key").value);$("connection").textContent="connected";$("repoLabel").textContent=config.owner+"/"+config.repo+" @ "+config.branch;loadedDirs.clear();$("tree").innerHTML="";await mountRoot()}
async function mountRoot(){const root=document.createElement("div");$("tree").appendChild(root);await renderDir(config.root,root,0,true)}
async function renderDir(path,host,depth,forceOpen=false){let data=loadedDirs.get(path);if(!data){data=await api("/api/list?path="+encodeURIComponent(path));loadedDirs.set(path,data)}host.innerHTML="";if(depth===0){const rootRow=document.createElement("div");rootRow.className="tree-row";rootRow.style.paddingLeft="4px";const twist=document.createElement("span");twist.className="twisty";twist.textContent="▼";const name=document.createElement("span");name.className="tree-name";name.textContent=data.path;rootRow.append(twist,name);host.appendChild(rootRow)}const items=data.items.slice().sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==="dir"?-1:1);for(const item of items){const wrap=document.createElement("div");const row=document.createElement("div");row.className="tree-row";row.style.paddingLeft=(8+depth*16)+"px";const twist=document.createElement("span");twist.className="twisty";twist.textContent=item.type==="dir"?"▶":"";const name=document.createElement("span");name.className="tree-name";name.textContent=item.name;row.append(twist,name);wrap.appendChild(row);host.appendChild(wrap);if(item.type==="dir"){let open=false,child=null;row.onclick=async()=>{try{showError();open=!open;twist.textContent=open?"▼":"▶";if(open){if(!child){child=document.createElement("div");wrap.appendChild(child)}await renderDir(item.path,child,depth+1)}else if(child){child.remove();child=null}}catch(e){showError(e)}}}else{row.onclick=()=>{setSelected(row);openFile(item.path).catch(showError)}}}}
async function openFile(path){showError();const f=await api("/api/file?path="+encodeURIComponent(path));$("path").value=f.path;$("editor").value=f.content;currentSha=f.sha;$("saveState").textContent="loaded"}
function newFile(){if(!config)return;const base=config.root.replace(/\/$/,"");$("path").value=base+"/new_file.py";$("editor").value="";currentSha=null;setSelected(null);$("saveState").textContent="new file";$("path").focus();$("path").select()}
async function saveFile(){showError();if(!config)throw new Error("connect first");const path=$("path").value.trim();if(!path)throw new Error("select a file");const d=await api("/api/file",{method:"PUT",body:JSON.stringify({path,content:$("editor").value,sha:currentSha})});currentSha=d.sha;$("saveState").textContent="saved "+d.commit_sha.slice(0,8);loadedDirs.clear();return d}
async function run(){showError();if($("path").value.trim())await saveFile();$("runStatus").textContent="requesting";const d=await api("/api/run",{method:"POST",body:JSON.stringify({entrypoint:$("entrypoint").value.trim()})});runCommit=d.commit_sha;runId=null;jobId=null;$("runSha").textContent=runCommit;$("runLink").textContent="-";$("result").textContent="";$("artifactLinks").textContent="";$("loadLog").disabled=true;if(pollTimer)clearTimeout(pollTimer);await pollRun()}
async function pollRun(){if(!runCommit)return;try{const d=await api("/api/run-status?sha="+encodeURIComponent(runCommit));if(!d.found){$("runStatus").textContent="queued";pollTimer=setTimeout(pollRun,4000);return}runId=d.run.id;$("runStatus").textContent=d.run.status+(d.run.conclusion?" / "+d.run.conclusion:"");$("runLink").innerHTML="<a target='_blank' rel='noreferrer' href='"+d.run.html_url+"'>"+d.run.id+"</a>";jobId=d.jobs[0]?.id||null;$("steps").textContent=d.jobs.flatMap(j=>[j.name+" : "+j.status+(j.conclusion?" / "+j.conclusion:""),...j.steps.map(s=>"  "+s.number+". "+s.name+" : "+s.status+(s.conclusion?" / "+s.conclusion:""))]).join("\n");if(d.run.status!=="completed"){pollTimer=setTimeout(pollRun,4000)}else{$("loadLog").disabled=!jobId;await loadArtifacts();if(jobId)await loadLog()}}catch(e){showError(e);pollTimer=setTimeout(pollRun,7000)}}
async function loadArtifacts(){if(!runId)return;const d=await api("/api/artifacts?run_id="+runId);const box=$("artifactLinks");box.innerHTML="";for(const a of d.artifacts){const link=document.createElement("a");link.href="#";link.textContent=a.name;link.style.marginRight="10px";link.onclick=async ev=>{ev.preventDefault();try{const r=await fetch("/api/artifact?id="+a.id,{headers:apiHeaders()});if(!r.ok)throw new Error(await r.text());const blob=await r.blob();const u=URL.createObjectURL(blob);const x=document.createElement("a");x.href=u;x.download=a.name+".zip";x.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}catch(e){showError(e)}};box.appendChild(link)}}
async function loadLog(){if(!jobId)return;showError();const r=await fetch("/api/log?job_id="+jobId,{headers:apiHeaders()});const text=await r.text();if(!r.ok)throw new Error(text);$("result").textContent=text}
$("connect").onclick=()=>connect().catch(showError);$("newFile").onclick=newFile;$("save").onclick=()=>saveFile().catch(showError);$("run").onclick=()=>run().catch(showError);$("loadLog").onclick=()=>loadLog().catch(showError);$("editor").addEventListener("keydown",e=>{if(e.key==="Tab"){e.preventDefault();const el=e.target,s=el.selectionStart,t=el.selectionEnd;el.value=el.value.slice(0,s)+"    "+el.value.slice(t);el.selectionStart=el.selectionEnd=s+4}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();saveFile().catch(showError)}});const saved=sessionStorage.getItem("notionIdeKey");if(saved){$("key").value=saved;connect().catch(showError)}
</script>
</body>
</html>`;

export const UI = String.raw`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Python Workspace</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:Arial,sans-serif;font-size:14px;color:#111;background:#fff}button,input,select,textarea{font:inherit;color:#111;background:#fff;border:1px solid #999;border-radius:0}button{padding:6px 10px;cursor:pointer}button:disabled{cursor:default;color:#888}input,select{padding:6px}body{display:grid;grid-template-rows:44px minmax(420px,1fr) minmax(250px,36vh) auto;overflow:hidden}header{padding:6px 8px;border-bottom:1px solid #aaa;display:flex;gap:8px;align-items:center;white-space:nowrap;overflow:auto}.grow{flex:1}.muted{color:#666}.error{color:#900;white-space:pre-wrap}.workspace{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:0;border-bottom:1px solid #aaa}.explorer{border-right:1px solid #aaa;overflow:auto;background:#fff;min-width:0}.pane-title{height:34px;padding:8px;border-bottom:1px solid #bbb;font-weight:600}.tree{padding:4px 0;font-family:Consolas,"Courier New",monospace;font-size:13px}.tree-row{height:26px;display:flex;align-items:center;gap:3px;padding-right:6px;cursor:pointer;white-space:nowrap}.tree-row:hover,.tree-row.selected{background:#eee}.twisty{width:18px;text-align:center;flex:0 0 18px}.tree-name{overflow:hidden;text-overflow:ellipsis}.editor-pane{display:grid;grid-template-rows:34px minmax(0,1fr) 38px;min-width:0;min-height:0}.editor-head{display:flex;align-items:center;gap:6px;padding:4px 6px;border-bottom:1px solid #bbb;min-width:0}.editor-head input{min-width:0;flex:1;border:0;padding:4px 6px}.editor-head input:focus{outline:1px solid #999}.editor-stack{position:relative;min-height:0;overflow:hidden;background:#fff}.editor,.highlight{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:10px;border:0;font-family:Consolas,"Courier New",monospace;font-size:13px;line-height:1.5;tab-size:4;white-space:pre;overflow:auto}.editor{z-index:2;resize:none;outline:0;background:#fff;color:#111}.editor.python{background:transparent;color:transparent;caret-color:#111}.editor.python::selection{background:rgba(130,160,210,.35)}.highlight{z-index:1;pointer-events:none;background:#fff;color:#111}.highlight.hidden{display:none}.py-keyword{color:#005cc5}.py-string{color:#a31515}.py-comment{color:#22863a}.py-number{color:#6f42c1}.py-builtin{color:#008080}.editor-foot{display:flex;align-items:center;gap:8px;padding:4px 6px;border-top:1px solid #bbb;min-width:0}.runner{display:grid;grid-template-columns:360px minmax(0,1fr);min-height:0;overflow:hidden}.run-panel{border-right:1px solid #aaa;padding:8px;overflow:auto}.run-row{display:flex;gap:6px;align-items:center;margin-bottom:8px}.run-row input,.run-row select{min-width:0;flex:1}.run-help{font-size:12px;color:#666;margin:-3px 0 8px 72px}.status-grid{display:grid;grid-template-columns:72px minmax(0,1fr);gap:5px;font-size:13px}.steps{margin-top:8px;border-top:1px solid #ccc;padding-top:6px;white-space:pre-wrap;font-family:Consolas,"Courier New",monospace;font-size:12px}.result-panel{display:grid;grid-template-rows:34px minmax(0,1fr);min-height:0}.result-head{display:flex;align-items:center;gap:8px;padding:4px 6px;border-bottom:1px solid #bbb;overflow:auto;white-space:nowrap}.result{margin:0;padding:8px;overflow:auto;white-space:pre-wrap;font-family:Consolas,"Courier New",monospace;font-size:12px;background:#fff}.connection-error{padding:4px 8px;border-top:1px solid #bbb;max-height:90px;overflow:auto}.hidden{display:none!important}.mobile-only{display:none}.drawer-backdrop{display:none}
@media(max-width:800px){body{grid-template-rows:44px minmax(500px,1fr) auto auto;overflow:auto}.mobile-only{display:inline-block}.workspace{display:block;min-height:calc(100vh - 44px);border-bottom:1px solid #aaa}.explorer{position:fixed;z-index:20;top:44px;bottom:0;left:0;width:min(84vw,320px);border-right:1px solid #777;transform:translateX(-101%);transition:transform .15s ease;box-shadow:2px 0 8px rgba(0,0,0,.12)}.explorer.open{transform:translateX(0)}.drawer-backdrop{position:fixed;z-index:19;inset:44px 0 0 0;background:rgba(0,0,0,.2)}.drawer-backdrop.open{display:block}.editor-pane{height:calc(100vh - 44px);min-height:500px}.runner{display:block;overflow:visible}.run-panel{border-right:0;border-bottom:1px solid #aaa;min-height:230px}.result-panel{min-height:280px}.repo-wide{display:none}.run-help{margin-left:0}.status-grid{grid-template-columns:64px minmax(0,1fr)}}
</style>
</head>
<body>
<header>
<button id="explorerToggle" class="mobile-only">Explorer</button>
<label>Key <input id="key" type="password" autocomplete="current-password"></label>
<button id="connect">Connect</button>
<span id="connection" class="muted">disconnected</span>
<span class="grow"></span>
<span id="repoLabel" class="muted repo-wide"></span>
<button id="openFull">Open full screen</button>
</header>

<div class="workspace">
<aside id="explorer" class="explorer">
<div class="pane-title">EXPLORER</div>
<div id="tree" class="tree"></div>
</aside>
<div id="drawerBackdrop" class="drawer-backdrop"></div>

<section class="editor-pane">
<div class="editor-head">
<input id="path" placeholder="select a file">
<button id="newFile">New</button>
</div>
<div class="editor-stack">
<pre id="highlight" class="highlight hidden" aria-hidden="true"></pre>
<textarea id="editor" class="editor" spellcheck="false" wrap="off"></textarea>
</div>
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
<div class="run-row"><span>Entrypoint</span><input id="entrypoint" value="src.train"><button id="selectedEntrypoint">Selected</button><button id="run">Run</button></div>
<div id="runRoot" class="run-help">base: repository root</div>
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
let config=null,currentSha=null,runCommit=null,runId=null,jobId=null,pollTimer=null,selectedRow=null,currentPath="";
const loadedDirs=new Map();
const PY_KEYWORDS=new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case".split(" "));
const PY_BUILTINS=new Set("abs all any bin bool breakpoint bytearray bytes callable chr classmethod compile complex delattr dict dir divmod enumerate eval exec filter float format frozenset getattr globals hasattr hash help hex id input int isinstance issubclass iter len list locals map max memoryview min next object oct open ord pow print property range repr reversed round set setattr slice sorted staticmethod str sum super tuple type vars zip __import__".split(" "));
function apiHeaders(jsonBody=false){const h={"x-ide-key":$("key").value};if(jsonBody)h["content-type"]="application/json";return h}
async function api(path,options={}){options.headers={...apiHeaders(Boolean(options.body)),...(options.headers||{})};const r=await fetch(path,options);const t=await r.text();let data=t;try{data=JSON.parse(t)}catch{}if(!r.ok)throw new Error(typeof data==="string"?data:JSON.stringify(data,null,2));return data}
function showError(e){const box=$("error");box.textContent=e?String(e.message||e):"";box.classList.toggle("hidden",!e)}
function setSelected(row){if(selectedRow)selectedRow.classList.remove("selected");selectedRow=row;if(row)row.classList.add("selected")}
function escapeHtml(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function span(cls,text){return "<span class='"+cls+"'>"+escapeHtml(text)+"</span>"}
function highlightPython(src){let out="",i=0;while(i<src.length){const ch=src[i];if(ch==="#"){let j=i+1;while(j<src.length&&src[j]!=="\n")j++;out+=span("py-comment",src.slice(i,j));i=j;continue}if(ch==='"'||ch==="'"){const q=ch,triple=src.slice(i,i+3)===q+q+q;let j=i+(triple?3:1),escaped=false;while(j<src.length){if(triple&&src.slice(j,j+3)===q+q+q){j+=3;break}const c=src[j];if(!triple&&!escaped&&c===q){j++;break}if(!triple&&!escaped&&c==="\n")break;if(c==="\\"&&!escaped)escaped=true;else escaped=false;j++}out+=span("py-string",src.slice(i,j));i=j;continue}if(/[0-9]/.test(ch)&&(i===0||!/[A-Za-z0-9_]/.test(src[i-1]))){let j=i+1;while(j<src.length&&/[0-9A-Fa-f_xXoObBeE.+-]/.test(src[j]))j++;out+=span("py-number",src.slice(i,j));i=j;continue}if(/[A-Za-z_]/.test(ch)){let j=i+1;while(j<src.length&&/[A-Za-z0-9_]/.test(src[j]))j++;const word=src.slice(i,j);if(PY_KEYWORDS.has(word))out+=span("py-keyword",word);else if(PY_BUILTINS.has(word))out+=span("py-builtin",word);else out+=escapeHtml(word);i=j;continue}out+=escapeHtml(ch);i++}return out+"\n"}
function isPythonPath(path){return /\.py$/i.test(path||"")}
function refreshHighlight(){const py=isPythonPath(currentPath||$("path").value.trim());$("editor").classList.toggle("python",py);$("highlight").classList.toggle("hidden",!py);if(py)$("highlight").innerHTML=highlightPython($("editor").value)}
function syncEditorScroll(){$("highlight").scrollTop=$("editor").scrollTop;$("highlight").scrollLeft=$("editor").scrollLeft}
function openDrawer(){$("explorer").classList.add("open");$("drawerBackdrop").classList.add("open")}
function closeDrawer(){$("explorer").classList.remove("open");$("drawerBackdrop").classList.remove("open")}
async function connect(){showError();config=await api("/api/bootstrap",{method:"POST"});sessionStorage.setItem("notionIdeKey",$("key").value);$("connection").textContent="connected";const runBase=config.run_root||"repository root";$("repoLabel").textContent=config.owner+"/"+config.repo+" @ "+config.branch+" | run: "+runBase;$("runRoot").textContent="base: "+runBase;loadedDirs.clear();$("tree").innerHTML="";await mountRoot()}
async function mountRoot(){const root=document.createElement("div");$("tree").appendChild(root);await renderDir(config.root,root,0)}
async function renderDir(path,host,depth){let data=loadedDirs.get(path);if(!data){data=await api("/api/list?path="+encodeURIComponent(path));loadedDirs.set(path,data)}host.innerHTML="";if(depth===0){const rootRow=document.createElement("div");rootRow.className="tree-row";rootRow.style.paddingLeft="4px";const twist=document.createElement("span");twist.className="twisty";twist.textContent="▼";const name=document.createElement("span");name.className="tree-name";name.textContent=data.path||config.repo;rootRow.append(twist,name);host.appendChild(rootRow)}const items=data.items.slice().sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==="dir"?-1:1);for(const item of items){const wrap=document.createElement("div"),row=document.createElement("div");row.className="tree-row";row.style.paddingLeft=(8+depth*16)+"px";const twist=document.createElement("span");twist.className="twisty";twist.textContent=item.type==="dir"?"▶":"";const name=document.createElement("span");name.className="tree-name";name.textContent=item.name;row.append(twist,name);wrap.appendChild(row);host.appendChild(wrap);if(item.type==="dir"){let open=false,child=null;row.onclick=async()=>{try{showError();open=!open;twist.textContent=open?"▼":"▶";if(open){if(!child){child=document.createElement("div");wrap.appendChild(child)}await renderDir(item.path,child,depth+1)}else if(child){child.remove();child=null}}catch(e){showError(e)}}}else{row.onclick=()=>{setSelected(row);openFile(item.path).then(()=>{if(matchMedia("(max-width:800px)").matches)closeDrawer()}).catch(showError)}}}}
async function openFile(path){showError();const f=await api("/api/file?path="+encodeURIComponent(path));currentPath=f.path;$("path").value=f.path;$("editor").value=f.content;currentSha=f.sha;$("saveState").textContent="loaded";refreshHighlight();syncEditorScroll()}
function newFile(){if(!config)return;const base=config.run_root||"";currentPath=(base?base+"/":"")+"new_file.py";$("path").value=currentPath;$("editor").value="";currentSha=null;setSelected(null);$("saveState").textContent="new file";refreshHighlight();$("path").focus();$("path").select()}
async function saveFile(){showError();if(!config)throw new Error("connect first");const path=$("path").value.trim();if(!path)throw new Error("select a file");const d=await api("/api/file",{method:"PUT",body:JSON.stringify({path,content:$("editor").value,sha:currentSha})});currentPath=path;currentSha=d.sha;$("saveState").textContent="saved "+d.commit_sha.slice(0,8);loadedDirs.clear();refreshHighlight();return d}
function useSelectedEntrypoint(){if(!config)throw new Error("connect first");const path=$("path").value.trim();const root=(config.run_root||"").replace(/\/$/,"");if(!path||!isPythonPath(path))throw new Error("select a .py file first");if(root&&path!==root&&!path.startsWith(root+"/"))throw new Error("selected file is outside "+root);const relative=root?path.slice(root.length).replace(/^\//,""):path;$("entrypoint").value=relative}
async function run(){showError();if($("path").value.trim())await saveFile();$("runStatus").textContent="requesting";const d=await api("/api/run",{method:"POST",body:JSON.stringify({entrypoint:$("entrypoint").value.trim()})});runCommit=d.commit_sha;runId=null;jobId=null;$("runSha").textContent=runCommit;$("runLink").textContent="-";$("result").textContent="";$("artifactLinks").textContent="";$("loadLog").disabled=true;if(pollTimer)clearTimeout(pollTimer);await pollRun()}
async function pollRun(){if(!runCommit)return;try{const d=await api("/api/run-status?sha="+encodeURIComponent(runCommit));if(!d.found){$("runStatus").textContent="queued";pollTimer=setTimeout(pollRun,4000);return}runId=d.run.id;$("runStatus").textContent=d.run.status+(d.run.conclusion?" / "+d.run.conclusion:"");$("runLink").innerHTML="<a target='_blank' rel='noreferrer' href='"+d.run.html_url+"'>"+d.run.id+"</a>";jobId=d.jobs[0]?.id||null;$("steps").textContent=d.jobs.flatMap(j=>[j.name+" : "+j.status+(j.conclusion?" / "+j.conclusion:""),...j.steps.map(s=>"  "+s.number+". "+s.name+" : "+s.status+(s.conclusion?" / "+s.conclusion:""))]).join("\n");if(d.run.status!=="completed"){pollTimer=setTimeout(pollRun,4000)}else{$("loadLog").disabled=!jobId;await loadArtifacts();if(jobId)await loadLog()}}catch(e){showError(e);pollTimer=setTimeout(pollRun,7000)}}
async function loadArtifacts(){if(!runId)return;const d=await api("/api/artifacts?run_id="+runId);const box=$("artifactLinks");box.innerHTML="";for(const a of d.artifacts){const link=document.createElement("a");link.href="#";link.textContent=a.name;link.style.marginRight="10px";link.onclick=async ev=>{ev.preventDefault();try{const r=await fetch("/api/artifact?id="+a.id,{headers:apiHeaders()});if(!r.ok)throw new Error(await r.text());const blob=await r.blob();const u=URL.createObjectURL(blob);const x=document.createElement("a");x.href=u;x.download=a.name+".zip";x.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}catch(e){showError(e)}};box.appendChild(link)}}
async function loadLog(){if(!jobId)return;showError();const r=await fetch("/api/log?job_id="+jobId,{headers:apiHeaders()});const text=await r.text();if(!r.ok)throw new Error(text);$("result").textContent=text}
$("connect").onclick=()=>connect().catch(showError);$("newFile").onclick=newFile;$("save").onclick=()=>saveFile().catch(showError);$("run").onclick=()=>run().catch(showError);$("loadLog").onclick=()=>loadLog().catch(showError);$("selectedEntrypoint").onclick=()=>{try{showError();useSelectedEntrypoint()}catch(e){showError(e)}};$("explorerToggle").onclick=openDrawer;$("drawerBackdrop").onclick=closeDrawer;$("openFull").onclick=()=>window.open(location.href,"_blank","noopener");$("path").addEventListener("input",()=>{currentPath=$("path").value.trim();refreshHighlight()});$("editor").addEventListener("input",refreshHighlight);$("editor").addEventListener("scroll",syncEditorScroll);$("editor").addEventListener("keydown",e=>{if(e.key==="Tab"){e.preventDefault();const el=e.target,s=el.selectionStart,t=el.selectionEnd;el.value=el.value.slice(0,s)+"    "+el.value.slice(t);el.selectionStart=el.selectionEnd=s+4;refreshHighlight()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();saveFile().catch(showError)}});const saved=sessionStorage.getItem("notionIdeKey");if(saved){$("key").value=saved;connect().catch(showError)}
</script>
</body>
</html>`;

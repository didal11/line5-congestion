(() => {
  const PROD_CONFIG_KEY = "notionIdeRunConfigsV1";
  const PROD_ARGS_KEY = "notionIdeRunArgsV1";
  let activeView = "";
  let queueTimer = null;
  let attachedQueueId = "";
  let contextPath = "";
  let contextType = "file";

  const style = document.createElement("style");
  style.textContent = `
  .prod-tool{padding:4px 7px;font-size:11px}
  .prod-panel{position:fixed;z-index:90;top:48px;right:8px;bottom:8px;width:min(430px,92vw);display:flex;flex-direction:column;border:1px solid #888;background:#fff;box-shadow:0 5px 18px rgba(0,0,0,.18)}
  .prod-panel.hidden{display:none}.prod-head{height:36px;display:flex;align-items:center;gap:6px;padding:5px 7px;border-bottom:1px solid #bbb}.prod-head strong{font-size:12px}.prod-body{min-height:0;overflow:auto;padding:8px}.prod-close{margin-left:auto;border:0;background:transparent;font-size:16px;padding:1px 5px}
  .prod-row{display:flex;align-items:center;gap:6px;margin-bottom:7px}.prod-row input,.prod-row select{min-width:0;flex:1}.prod-row button{padding:4px 7px}.prod-muted{font-size:11px;color:#666}.prod-list{border:1px solid #ccc}.prod-item{padding:7px;border-bottom:1px solid #ddd;cursor:pointer}.prod-item:last-child{border-bottom:0}.prod-item:hover{background:#f3f6f8}.prod-item-title{font-family:var(--code-font);font-size:12px;word-break:break-all}.prod-item-sub{font-size:10px;color:#666;margin-top:3px;white-space:pre-wrap}.prod-state{font-weight:700;font-size:11px}.prod-state.IN_PROGRESS{color:#0550ae}.prod-state.QUEUED,.prod-state.WAITING,.prod-state.WAITING_FOR_RUN,.prod-state.REQUESTING{color:#7a5b00}.prod-state.SUCCESS{color:#116329}.prod-state.FAILED,.prod-state.IDE_ERROR{color:#9a1b1b}.prod-state.CANCELLED,.prod-state.TIMED_OUT{color:#666}
  .prod-context{position:fixed;z-index:120;min-width:170px;border:1px solid #888;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.18);padding:3px}.prod-context.hidden{display:none}.prod-context button{display:block;width:100%;border:0;text-align:left;padding:6px 9px;background:#fff}.prod-context button:hover{background:#eee}.prod-context hr{border:0;border-top:1px solid #ddd;margin:3px 0}
  .prod-search-preview{font-family:var(--code-font);font-size:11px;color:#444;white-space:pre-wrap;word-break:break-word}.prod-queue-actions{margin-left:auto;display:flex;gap:4px}.prod-badge{display:inline-block;min-width:18px;padding:1px 5px;border:1px solid #aaa;text-align:center;font-size:10px}
  @media(max-width:800px){.prod-tool-label{display:none}.prod-panel{top:46px;right:4px;bottom:4px;width:calc(100vw - 8px)}}`;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.id = "prodPanel";
  panel.className = "prod-panel hidden";
  panel.innerHTML = `<div class="prod-head"><strong id="prodTitle">TOOLS</strong><button id="prodClose" class="prod-close" type="button">×</button></div><div id="prodBody" class="prod-body"></div>`;
  document.body.appendChild(panel);

  const context = document.createElement("div");
  context.id = "prodContext";
  context.className = "prod-context hidden";
  context.innerHTML = `<button data-action="new-file">New File</button><button data-action="new-folder">New Folder</button><hr><button data-action="rename">Rename</button><button data-action="move">Move…</button><button data-action="download">Download</button><hr><button data-action="delete">Delete</button>`;
  document.body.appendChild(context);

  const toolbar = document.createElement("span");
  toolbar.style.display = "flex";
  toolbar.style.gap = "4px";
  toolbar.innerHTML = `<button id="prodSearch" class="prod-tool" type="button">Search</button><button id="prodHistory" class="prod-tool" type="button">History</button><button id="prodQueue" class="prod-tool" type="button">Queue <span id="prodQueueBadge" class="prod-badge">0</span></button><button id="prodArgs" class="prod-tool" type="button">Args</button>`;
  const runButton = $("run");
  runButton.parentNode.insertBefore(toolbar, runButton);

  function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[ch]); }
  function basename(path) { const p=String(path||"").split("/"); return p[p.length-1]||""; }
  function joinPath(a,b){ return a ? `${a.replace(/\/$/,"")}/${b.replace(/^\//,"")}` : b.replace(/^\//,""); }
  function quoteArg(value){ const s=String(value); return /^[A-Za-z0-9_./:=+,-]+$/.test(s)?s:`"${s.replace(/(["\\$`])/g,"\\$1")}"`; }
  function shellSplit(input){
    const out=[]; let cur="", quote="", escaped=false, started=false;
    for(const ch of String(input||"")){
      if(escaped){cur+=ch;escaped=false;started=true;continue}
      if(ch==="\\" && quote!=="'"){escaped=true;started=true;continue}
      if(quote){if(ch===quote){quote=""}else cur+=ch;started=true;continue}
      if(ch==="'"||ch==='"'){quote=ch;started=true;continue}
      if(/\s/.test(ch)){if(started){out.push(cur);cur="";started=false}continue}
      cur+=ch;started=true;
    }
    if(escaped)cur+="\\"; if(quote)throw new Error("unclosed quote in run arguments"); if(started)out.push(cur); return out;
  }
  async function displayCommand(entrypoint,args){ const base=await pythonCommand(entrypoint); return [base,...args.map(quoteArg)].join(" "); }
  function ensureConnected(){ if(!config)throw new Error("connect first"); }
  function setToolsEnabled(){ const disabled=!config; for(const id of ["prodSearch","prodHistory","prodQueue","prodArgs"])$(id).disabled=disabled; }
  function openPanel(view){ activeView=view; panel.classList.remove("hidden"); renderView().catch(showError); }
  function closePanel(){ activeView=""; panel.classList.add("hidden"); }
  $("prodClose").onclick=closePanel;
  $("prodSearch").onclick=()=>openPanel("search");
  $("prodHistory").onclick=()=>openPanel("history");
  $("prodQueue").onclick=()=>openPanel("queue");
  $("prodArgs").onclick=()=>openPanel("args");
  setToolsEnabled();

  const originalConnect = connect;
  connect = async function(){ const result=await originalConnect(); setToolsEnabled(); startQueuePolling(); return result; };

  function loadConfigs(){ try{const v=JSON.parse(localStorage.getItem(PROD_CONFIG_KEY)||"[]");return Array.isArray(v)?v:[]}catch{return[]} }
  function saveConfigs(items){localStorage.setItem(PROD_CONFIG_KEY,JSON.stringify(items))}
  function currentArgsText(){ return localStorage.getItem(PROD_ARGS_KEY)||""; }
  function setArgsText(value){ localStorage.setItem(PROD_ARGS_KEY,String(value||"")); const el=$("prodArgsInput"); if(el)el.value=String(value||""); }

  async function renderArgs(){
    $("prodTitle").textContent="RUN ARGUMENTS"; const configs=loadConfigs();
    $("prodBody").innerHTML=`<div class="prod-row"><input id="prodArgsInput" placeholder="--epochs 50 --batch-size 32" value="${esc(currentArgsText())}"></div><div class="prod-muted" style="margin-bottom:8px">Arguments are parsed like a shell command and sent to Python as a JSON string array.</div><div class="prod-row"><select id="prodConfigSelect"><option value="">Saved configurations…</option>${configs.map((c,i)=>`<option value="${i}">${esc(c.name)}${c.path?` — ${esc(c.path)}`:""}</option>`).join("")}</select><button id="prodLoadConfig">Load</button></div><div class="prod-row"><button id="prodSaveConfig">Save current config</button><button id="prodDeleteConfig">Delete selected</button></div><div id="prodArgsPreview" class="prod-list"></div>`;
    $("prodArgsInput").oninput=()=>{setArgsText($("prodArgsInput").value);renderArgsPreview().catch(()=>{})};
    $("prodSaveConfig").onclick=()=>{try{const name=prompt("Configuration name:",currentPath?basename(currentPath):"run");if(!name)return;const items=loadConfigs();items.push({name:name.trim().slice(0,80),path:currentPath||"",args:$("prodArgsInput").value});saveConfigs(items);renderArgs()}catch(e){showError(e)}};
    $("prodLoadConfig").onclick=async()=>{const i=Number($("prodConfigSelect").value);const item=loadConfigs()[i];if(!item)return;setArgsText(item.args||"");if(item.path)await openFile(item.path);await renderArgs()};
    $("prodDeleteConfig").onclick=()=>{const i=Number($("prodConfigSelect").value);const items=loadConfigs();if(!Number.isInteger(i)||!items[i])return;items.splice(i,1);saveConfigs(items);renderArgs()};
    await renderArgsPreview();
  }
  async function renderArgsPreview(){ const box=$("prodArgsPreview");if(!box)return;try{if(!currentPath||!isPythonPath(currentPath)){box.innerHTML='<div class="prod-item prod-muted">Select a Python file to preview the command.</div>';return}const args=shellSplit($("prodArgsInput")?.value||currentArgsText());const cmd=await displayCommand(currentEntrypoint(),args);box.innerHTML=`<div class="prod-item"><div class="prod-item-title">$ ${esc(cmd)}</div></div>`}catch(e){box.innerHTML=`<div class="prod-item" style="color:#900">${esc(e.message)}</div>`}}

  async function enqueueCurrentRun(beforeId=""){
    if(beforeId && typeof beforeId!=="string")beforeId="";
    showError();
    ensureConnected();
    const entrypoint=currentEntrypoint();
    if(currentBuffer()?.dirty)await saveFile();
    const args=shellSplit(currentArgsText());
    const command=await displayCommand(entrypoint,args);
    const payload={entrypoint,args};
    if(beforeId)payload.before_id=beforeId;
    const d=await api("/api/queue",{method:"POST",body:JSON.stringify(payload)});
    appendTerminal(`[QUEUE] ${command}\n[QUEUE] id ${d.item.id.slice(0,8)} · ${d.item.status}${beforeId?" · inserted":""}`);
    openPanel("queue");
    await pollQueue();
    updateRunButton();
    return d;
  }
  run = ()=>enqueueCurrentRun("");
  runButton.onclick=(event)=>{event.preventDefault();enqueueCurrentRun("").catch(showError)};
  updateRunButton = function(){
    $("run").disabled=!config||!isPythonPath(currentPath);
    const active=["REQUESTING","WAITING_FOR_RUN","QUEUED","IN_PROGRESS","CANCEL_REQUESTED"].some(s=>lastLifecycle.startsWith(s));
    if($("cancelRun"))$("cancelRun").disabled=!runId||!active||lastLifecycle.startsWith("CANCEL_REQUESTED");
  };

  function terminalState(status){return new Set(["SUCCESS","FAILED","CANCELLED","TIMED_OUT","IDE_ERROR"]).has(status)}
  async function attachQueueItem(item){
    if(!item?.request_commit_sha)return;
    if(attachedQueueId===item.id){if(item.run_id&&!runId){runId=item.run_id;persistRunSession()}return}
    attachedQueueId=item.id;runCommit=item.request_commit_sha;runId=item.run_id||null;jobId=null;cancelRequested=Boolean(item.cancel_requested);liveLogText="";liveLogSeq=0;lastLiveLogFetch=0;lastRunCommand=await displayCommand(item.entrypoint,item.args||[]);
    $("terminalCommand").textContent="$ "+lastRunCommand;$("runLink").textContent="";$("artifactLinks").textContent="";$("loadLog").disabled=true;setRunState(item.status||"WAITING_FOR_RUN");persistRunSession();if(pollTimer){clearTimeout(pollTimer);pollTimer=null}pollRun().catch(showError);
  }
  async function pollQueue(){
    if(!config)return null;
    const data=await api("/api/queue");
    const pending=data.items.filter(i=>!terminalState(i.status)).length;
    $("prodQueueBadge").textContent=String(pending);
    const active=data.items.find(i=>i.id===data.active_id);
    if(active?.request_commit_sha)await attachQueueItem(active);
    if(activeView==="queue")renderQueueData(data);
    return data;
  }
  function startQueuePolling(){if(queueTimer)clearInterval(queueTimer);pollQueue().catch(()=>{});queueTimer=setInterval(()=>pollQueue().catch(()=>{}),3000)}
  async function cancelQueueItem(id){await api("/api/queue/cancel",{method:"POST",body:JSON.stringify({id})});await pollQueue()}
  async function removeQueueItem(id){await api("/api/queue/remove",{method:"POST",body:JSON.stringify({id})});await pollQueue()}
  async function reorderQueueItem(id,beforeId=""){await api("/api/queue/reorder",{method:"POST",body:JSON.stringify({id,before_id:beforeId||""})});await pollQueue()}
  async function clearQueueFinished(){await api("/api/queue/clear",{method:"POST",body:"{}"});await pollQueue()}
  async function insertCurrentBefore(id){if(!currentPath||!isPythonPath(currentPath))throw new Error("select a Python file before inserting a run");await enqueueCurrentRun(id)}
  function queueActionButton(label,title,handler){const b=document.createElement("button");b.type="button";b.textContent=label;b.title=title||label;b.onclick=(e)=>{e.stopPropagation();handler().catch(showError)};return b}
  function renderQueueData(data){
    if(activeView!=="queue")return;
    $("prodTitle").textContent="RUN QUEUE";
    const body=$("prodBody");
    body.innerHTML=`<div class="prod-row"><span class="prod-muted">Runs execute sequentially. Drag WAITING rows to reorder; use ↑/↓ on mobile.</span><button id="prodClearQueue">Clear finished</button></div><div id="prodQueueList" class="prod-list"></div>`;
    $("prodClearQueue").onclick=()=>clearQueueFinished().catch(showError);
    const list=$("prodQueueList");
    const active=data.items.find(i=>i.id===data.active_id)||null;
    const waiting=data.items.filter(i=>i.status==="WAITING");
    const finished=data.items.filter(i=>terminalState(i.status)).reverse();
    const other=data.items.filter(i=>!terminalState(i.status)&&i.status!=="WAITING"&&(!active||i.id!==active.id));
    const items=[...(active?[active]:[]),...other,...waiting,...finished];
    if(!items.length){list.innerHTML='<div class="prod-item prod-muted">Queue is empty.</div>';return}
    const waitingIds=waiting.map(i=>i.id);
    for(const item of items){
      const div=document.createElement("div");
      div.className="prod-item";
      div.dataset.queueId=item.id;
      const args=(item.args||[]).map(quoteArg).join(" ");
      const waitingIndex=waitingIds.indexOf(item.id);
      if(item.status==="WAITING"){
        div.draggable=true;
        div.title="Drag to reorder queued run";
        div.ondragstart=(e)=>{e.dataTransfer.setData("text/plain",item.id);e.dataTransfer.effectAllowed="move"};
        div.ondragover=(e)=>{e.preventDefault();e.dataTransfer.dropEffect="move";div.style.outline="2px solid #4a78c2"};
        div.ondragleave=()=>{div.style.outline=""};
        div.ondrop=(e)=>{e.preventDefault();div.style.outline="";const dragged=e.dataTransfer.getData("text/plain");if(dragged&&dragged!==item.id)reorderQueueItem(dragged,item.id).catch(showError)};
      }
      div.innerHTML=`<div class="prod-row" style="margin:0"><span class="prod-state ${esc(item.status)}">${esc(item.status)}</span><span class="prod-item-title">${esc(item.entrypoint)}</span><span class="prod-queue-actions"></span></div><div class="prod-item-sub">${esc(args)}${item.run_id?`\nrun ${item.run_id}`:""}${item.error?`\n${esc(item.error)}`:""}</div>`;
      const actions=div.querySelector(".prod-queue-actions");
      if(item.status==="WAITING"){
        if(waitingIndex>0)actions.appendChild(queueActionButton("↑","Move up",()=>reorderQueueItem(item.id,waitingIds[waitingIndex-1])));
        if(waitingIndex>=0&&waitingIndex<waitingIds.length-1){
          const afterNext=waitingIds[waitingIndex+2]||"";
          actions.appendChild(queueActionButton("↓","Move down",()=>reorderQueueItem(item.id,afterNext)));
        }
        actions.appendChild(queueActionButton("Insert","Insert current Python file before this run",()=>insertCurrentBefore(item.id)));
        actions.appendChild(queueActionButton("Remove","Remove this waiting run from queue",()=>removeQueueItem(item.id)));
      }else if(!terminalState(item.status)){
        actions.appendChild(queueActionButton("Cancel","Cancel active run",()=>cancelQueueItem(item.id)));
      }
      list.appendChild(div);
    }
    if(waiting.length){
      const tail=document.createElement("div");
      tail.className="prod-item prod-muted";
      tail.textContent="Drop a WAITING run here to move it to the end";
      tail.ondragover=(e)=>{e.preventDefault();tail.style.outline="2px solid #4a78c2"};
      tail.ondragleave=()=>{tail.style.outline=""};
      tail.ondrop=(e)=>{e.preventDefault();tail.style.outline="";const dragged=e.dataTransfer.getData("text/plain");if(dragged)reorderQueueItem(dragged,"").catch(showError)};
      list.appendChild(tail);
    }
  }
  async function renderQueue(){$("prodTitle").textContent="RUN QUEUE";$("prodBody").innerHTML='<div class="prod-muted">Loading queue…</div>';const data=await pollQueue();if(data)renderQueueData(data)}

  async function renderSearch(){
    $("prodTitle").textContent="SEARCH";$("prodBody").innerHTML=`<div class="prod-row"><select id="prodSearchMode"><option value="name">File / folder name</option><option value="text">Project text</option></select><input id="prodSearchInput" placeholder="Search workspace"><button id="prodSearchGo">Search</button></div><div id="prodSearchInfo" class="prod-muted" style="margin-bottom:6px"></div><div id="prodSearchResults" class="prod-list"></div>`;
    const go=()=>doSearch().catch(showError);$("prodSearchGo").onclick=go;$("prodSearchInput").onkeydown=e=>{if(e.key==="Enter")go()};$("prodSearchInput").focus();
  }
  async function doSearch(){const q=$("prodSearchInput").value.trim();if(!q)return;$("prodSearchInfo").textContent="Searching…";const mode=$("prodSearchMode").value;const d=await api(`/api/search?mode=${encodeURIComponent(mode)}&q=${encodeURIComponent(q)}`);$("prodSearchInfo").textContent=`${d.results.length} result(s)${d.scanned!=null?` · scanned ${d.scanned} text files`:""}`;const box=$("prodSearchResults");box.innerHTML="";for(const hit of d.results){const div=document.createElement("div");div.className="prod-item";div.innerHTML=`<div class="prod-item-title">${esc(hit.path)}${hit.line?`:${hit.line}`:""}</div>${hit.preview!=null?`<div class="prod-search-preview">${esc(hit.preview)}</div>`:`<div class="prod-item-sub">${esc(hit.type||"")}</div>`}`;div.onclick=()=>openSearchHit(hit).catch(showError);box.appendChild(div)}if(!d.results.length)box.innerHTML='<div class="prod-item prod-muted">No results.</div>'}
  async function openSearchHit(hit){if(hit.type==="dir"){selectedFolder=hit.path;updateImportUi();closePanel();return}await openFile(hit.path);if(hit.line){const lines=$("editor").value.split("\n");let pos=0;for(let i=1;i<hit.line;i++)pos+=lines[i-1].length+1;$("editor").selectionStart=pos;$("editor").selectionEnd=pos+(lines[hit.line-1]?.length||0);$("editor").focus();refreshActiveLine()}closePanel()}

  async function renderHistory(){
    $("prodTitle").textContent="IDE HISTORY";$("prodBody").innerHTML='<div class="prod-muted" style="margin-bottom:6px">Only user-facing Notion IDE commits are shown. Revert is blocked if newer changes touched the same files.</div><div id="prodHistoryList" class="prod-list"></div>';const d=await api("/api/history?limit=30");const box=$("prodHistoryList");box.innerHTML="";for(const item of d.items){const div=document.createElement("div");div.className="prod-item";div.innerHTML=`<div class="prod-row" style="margin:0"><div style="min-width:0;flex:1"><div class="prod-item-title">${esc(item.message)}</div><div class="prod-item-sub">${esc(item.short_sha)} · ${esc(item.date?new Date(item.date).toLocaleString():"")}</div></div><button type="button">Revert</button></div>`;div.querySelector("button").onclick=()=>revertHistory(item).catch(showError);box.appendChild(div)}if(!d.items.length)box.innerHTML='<div class="prod-item prod-muted">No IDE history yet.</div>'
  }
  async function revertHistory(item){if([...openFiles.values()].some(b=>b.dirty))throw new Error("save or close unsaved editor tabs before reverting");if(!confirm(`Revert ${item.short_sha}?\n\n${item.message}\n\nA new Git commit will be created.`))return;const d=await api("/api/revert",{method:"POST",body:JSON.stringify({commit_sha:item.sha})});appendTerminal(`[REVERT] ${item.short_sha} → commit ${d.commit_sha.slice(0,8)}`);await reloadChangedPaths(d.paths||[]);await renderHistory()}
  async function reloadChangedPaths(paths){const affected=(p)=>paths.some(x=>p===x);const reopen=currentPath&&affected(currentPath)?currentPath:"";for(const p of [...openFiles.keys()])if(affected(p))openFiles.delete(p);if(reopen){currentPath="";currentSha=null;$("path").value="";$("path").readOnly=true;$("editor").value="";renderTabs();try{await openFile(reopen)}catch{refreshHighlight();updateSaveState()}}else renderTabs();await refreshExplorer()}

  async function renderView(){ensureConnected();if(activeView==="search")return renderSearch();if(activeView==="history")return renderHistory();if(activeView==="queue")return renderQueue();if(activeView==="args")return renderArgs()}

  function selectContextRow(row){const path=row?.dataset?.path;if(!path)return;if(!selectedPaths.has(path)){selectedPaths.clear();selectedPaths.add(path);selectionAnchorPath=path;syncSelectionUi()}contextPath=path;contextType=row.dataset.type||"file"}
  function showContextMenu(event,row){selectContextRow(row);context.style.left=Math.min(event.clientX,window.innerWidth-180)+"px";context.style.top=Math.min(event.clientY,window.innerHeight-250)+"px";context.classList.remove("hidden")}
  function hideContextMenu(){context.classList.add("hidden")}
  $("tree").addEventListener("contextmenu",event=>{const row=event.target.closest(".tree-row[data-path]");if(!row)return;event.preventDefault();showContextMenu(event,row)});
  document.addEventListener("click",event=>{if(!event.target.closest("#prodContext"))hideContextMenu()});window.addEventListener("blur",hideContextMenu);

  function contextTargetFolder(){return contextType==="dir"?contextPath:parentPath(contextPath)}
  async function newFileAt(folder){const name=prompt("New file name:","new_file.py");if(!name)return;const clean=name.trim().replace(/^\/+/,"");if(!clean||clean.includes("..")||clean.includes("/"))throw new Error("enter one valid file name");const path=joinPath(folder,clean);await api("/api/file",{method:"PUT",body:JSON.stringify({path,content:"",sha:null})});appendTerminal(`[NEW FILE] ${path}`);await refreshExplorer();await openFile(path)}
  async function newFolderAt(folder){const name=prompt("New folder name:","new_folder");if(!name)return;const clean=name.trim().replace(/^\/+/,"");if(!clean||clean.includes("..")||clean.includes("/"))throw new Error("enter one valid folder name");const path=joinPath(folder,clean);const d=await api("/api/mkdir",{method:"POST",body:JSON.stringify({path})});appendTerminal(`[NEW FOLDER] ${path} · commit ${d.commit_sha.slice(0,8)}`);await refreshExplorer()}
  function selectedForAction(){return selectedPaths.size?[...selectedPaths]:contextPath?[contextPath]:[]}
  async function renameContext(){const paths=selectedForAction();if(paths.length!==1)throw new Error("Rename requires exactly one selected item");const from=paths[0],name=prompt("New name:",basename(from));if(!name||name===basename(from))return;const clean=name.trim();if(!clean||clean.includes("/")||clean==="."||clean==="..")throw new Error("invalid name");const to=joinPath(parentPath(from),clean);const d=await api("/api/move",{method:"POST",body:JSON.stringify({moves:[{from,to}]})});applyMovedPaths(d.moves);appendTerminal(`[RENAME] ${from} → ${to} · commit ${d.commit_sha.slice(0,8)}`);await refreshExplorer()}
  async function moveSelection(){const paths=selectedForAction();if(!paths.length)return;const destination=prompt("Move selected item(s) to folder path. Leave empty for repository root:",selectedFolder||"");if(destination===null)return;const dest=String(destination).trim().replace(/^\/+|\/+$/g,"");if(dest.includes(".."))throw new Error("invalid destination");const moves=paths.map(from=>({from,to:joinPath(dest,basename(from))}));const d=await api("/api/move",{method:"POST",body:JSON.stringify({moves})});applyMovedPaths(d.moves);selectedPaths.clear();selectionAnchorPath="";appendTerminal(`[MOVE] ${d.moves.length} item(s) → /${dest} · commit ${d.commit_sha.slice(0,8)}`);await refreshExplorer();syncSelectionUi()}
  function applyMovedPaths(moves){const pairs=[...moves].sort((a,b)=>b.from.length-a.from.length);let newCurrent=currentPath;for(const [path,b] of [...openFiles.entries()]){const m=pairs.find(x=>path===x.from||path.startsWith(x.from+"/"));if(!m)continue;const next=m.to+path.slice(m.from.length);openFiles.delete(path);b.path=next;openFiles.set(next,b);if(newCurrent===path)newCurrent=next}if(newCurrent!==currentPath&&openFiles.has(newCurrent))showBuffer(newCurrent);else renderTabs()}
  async function downloadOne(){const paths=selectedForAction();if(paths.length!==1)throw new Error("Download one file or folder at a time");const path=paths[0];const r=await fetch(`/api/download?path=${encodeURIComponent(path)}`,{headers:apiHeaders(false)});if(!r.ok){const text=await r.text();throw new Error(`HTTP ${r.status}: ${friendlyError(text)}`)}const blob=await r.blob(),a=document.createElement("a");a.href=URL.createObjectURL(blob);const cd=r.headers.get("content-disposition")||"";let name=basename(path)+(contextType==="dir"?".zip":"");const m=cd.match(/filename\*=UTF-8''([^;]+)/i);if(m)try{name=decodeURIComponent(m[1])}catch{}a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  context.addEventListener("click",event=>{const action=event.target.closest("button")?.dataset.action;if(!action)return;hideContextMenu();const runAction=async()=>{if(action==="new-file")return newFileAt(contextTargetFolder());if(action==="new-folder")return newFolderAt(contextTargetFolder());if(action==="rename")return renameContext();if(action==="move")return moveSelection();if(action==="download")return downloadOne();if(action==="delete")return deleteSelection()};runAction().catch(showError)});

  document.addEventListener("keydown",event=>{if(event.key==="F2"&&selectedPaths.size===1){event.preventDefault();renameContext().catch(showError)}if(event.key==="Delete"&&selectedPaths.size&&document.activeElement!==$("editor")&&document.activeElement!==$("path")){event.preventDefault();deleteSelection().catch(showError)}});

  if(config){setToolsEnabled();startQueuePolling()}
})();

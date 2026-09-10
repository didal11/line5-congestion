from pathlib import Path

APP = Path('notion-ide/worker/src/app.js')
PROD = Path('notion-ide/worker/public/ide-productivity.js')

app = APP.read_text(encoding='utf-8')
old_routes = '''      if (url.pathname === "/api/queue" && request.method === "GET") return await proxyRunQueue(request, env, "/");\n      if (url.pathname === "/api/queue" && request.method === "POST") return await proxyRunQueue(request, env, "/enqueue");\n      if (url.pathname === "/api/queue/cancel" && request.method === "POST") return await proxyRunQueue(request, env, "/cancel");\n      if (url.pathname === "/api/queue/clear" && request.method === "POST") return await proxyRunQueue(request, env, "/clear");\n'''
new_routes = '''      if (url.pathname === "/api/queue" && request.method === "GET") return await proxyRunQueue(request, env, "/");\n      if (url.pathname === "/api/queue" && request.method === "POST") return await proxyRunQueue(request, env, "/enqueue");\n      if (url.pathname === "/api/queue/reorder" && request.method === "POST") return await proxyRunQueue(request, env, "/reorder");\n      if (url.pathname === "/api/queue/remove" && request.method === "POST") return await proxyRunQueue(request, env, "/remove");\n      if (url.pathname === "/api/queue/cancel" && request.method === "POST") return await proxyRunQueue(request, env, "/cancel");\n      if (url.pathname === "/api/queue/clear" && request.method === "POST") return await proxyRunQueue(request, env, "/clear");\n'''
if old_routes in app:
    app = app.replace(old_routes, new_routes, 1)
elif new_routes not in app:
    raise SystemExit('queue route marker not found')
APP.write_text(app, encoding='utf-8')

prod = PROD.read_text(encoding='utf-8')
start = prod.index('  async function enqueueCurrentRun(){')
end = prod.index('  async function renderSearch(){', start)
queue_block = r'''  async function enqueueCurrentRun(beforeId=""){
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

'''
prod = prod[:start] + queue_block + prod[end:]
PROD.write_text(prod, encoding='utf-8')

print('patched queue routes and UI')

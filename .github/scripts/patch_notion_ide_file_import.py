from pathlib import Path
import re

APP = Path('notion-ide/worker/src/app.js')
UI = Path('notion-ide/worker/src/ui.js')

app = APP.read_text(encoding='utf-8')
import_marker = 'import { LiveLogDurableObject } from "./live-log.js";\n'
import_line = 'import { apiImportFiles } from "./file-import.js";\n'
if import_line not in app:
    if app.count(import_marker) != 1:
        raise SystemExit('app import marker mismatch')
    app = app.replace(import_marker, import_marker + import_line)
route_marker = '      if (url.pathname === "/api/file" && request.method === "PUT") return await apiFilePut(request, env);\n'
route_line = '      if (url.pathname === "/api/import" && request.method === "POST") return await apiImportFiles(request, env);\n'
if route_line not in app:
    if app.count(route_marker) != 1:
        raise SystemExit('app route marker mismatch')
    app = app.replace(route_marker, route_marker + route_line)
APP.write_text(app, encoding='utf-8')

ui = UI.read_text(encoding='utf-8')

old_css = '.pane-title{height:30px;padding:7px 8px;border-bottom:1px solid #bbb;font-weight:600;font-size:12px;letter-spacing:.02em}.tree{padding:3px 0;font-family:var(--code-font);font-size:12px}.tree-row{height:24px;display:flex;align-items:center;gap:2px;padding-right:6px;cursor:pointer;white-space:nowrap}.tree-row:hover,.tree-row.selected{background:#eee}'
new_css = '.pane-title{height:30px;padding:4px 6px 4px 8px;border-bottom:1px solid #bbb;font-weight:600;font-size:12px;letter-spacing:.02em;display:flex;align-items:center;gap:6px}.pane-caption{flex:0 0 auto}.upload-target{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;font-family:var(--code-font);font-size:10px;font-weight:400;color:#666}.explorer-add{flex:0 0 auto;padding:2px 6px;font-size:11px}.tree{padding:3px 0;font-family:var(--code-font);font-size:12px}.tree-row{height:24px;display:flex;align-items:center;gap:2px;padding-right:6px;cursor:pointer;white-space:nowrap}.tree-row:hover,.tree-row.selected{background:#eee}.tree-row.folder-selected{background:#e8f1ff}.tree-row.drop-target{outline:2px solid #4a78c2;outline-offset:-2px;background:#edf4ff}'
if old_css not in ui:
    raise SystemExit('CSS marker mismatch')
ui = ui.replace(old_css, new_css)

old_html = '<div class="pane-title">EXPLORER</div>\n<div id="tree" class="tree"></div>'
new_html = '''<div class="pane-title explorer-head">
<span class="pane-caption">EXPLORER</span>
<span id="uploadTarget" class="upload-target" title="Upload target">/</span>
<button id="importFiles" class="explorer-add" type="button" title="Add local files to selected folder" disabled>+ Add</button>
<input id="filePicker" class="hidden" type="file" multiple>
</div>
<div id="tree" class="tree"></div>'''
if old_html not in ui:
    raise SystemExit('HTML marker mismatch')
ui = ui.replace(old_html, new_html)

old_vars = 'let config=null,currentSha=null,runCommit=null,runId=null,jobId=null,pollTimer=null,selectedRow=null,currentPath="",lastRunCommand="",lastLifecycle="IDLE",cancelRequested=false,liveLogText="",liveLogSeq=0,lastLiveLogFetch=0;'
new_vars = 'let config=null,currentSha=null,runCommit=null,runId=null,jobId=null,pollTimer=null,selectedRow=null,selectedFolderRow=null,selectedFolder="",importBusy=false,currentPath="",lastRunCommand="",lastLifecycle="IDLE",cancelRequested=false,liveLogText="",liveLogSeq=0,lastLiveLogFetch=0;'
if old_vars not in ui:
    raise SystemExit('variable marker mismatch')
ui = ui.replace(old_vars, new_vars)

old_maps = 'const loadedDirs=new Map();\nconst openFiles=new Map();'
new_maps = 'const loadedDirs=new Map();\nconst expandedDirs=new Set();\nconst openFiles=new Map();'
if old_maps not in ui:
    raise SystemExit('map marker mismatch')
ui = ui.replace(old_maps, new_maps)

old_selected = 'function setSelected(row){if(selectedRow)selectedRow.classList.remove("selected");selectedRow=row;if(row)row.classList.add("selected")}\n'
new_selected = '''function setSelected(row){if(selectedRow)selectedRow.classList.remove("selected");selectedRow=row;if(row)row.classList.add("selected")}
function parentPath(path){const parts=String(path||"").split("/");parts.pop();return parts.join("/")}
function displayFolder(path){return path?"/"+path:"/"}
function updateImportUi(){const button=$("importFiles");if(button){button.disabled=!config||importBusy;button.textContent=importBusy?"Adding…":"+ Add"}const target=$("uploadTarget");if(target){target.textContent=displayFolder(selectedFolder);target.title="Upload target: "+displayFolder(selectedFolder)}}
function selectFolder(row,path){if(selectedFolderRow)selectedFolderRow.classList.remove("folder-selected");selectedFolderRow=row||null;selectedFolder=String(path||"");if(selectedFolderRow)selectedFolderRow.classList.add("folder-selected");updateImportUi()}
function hasFileDrag(event){return Array.from(event.dataTransfer?.types||[]).includes("Files")}
function attachDropTarget(row,path){row.addEventListener("dragover",event=>{if(!hasFileDrag(event))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect="copy";row.classList.add("drop-target")});row.addEventListener("dragleave",event=>{if(!row.contains(event.relatedTarget))row.classList.remove("drop-target")});row.addEventListener("drop",event=>{if(!hasFileDrag(event))return;event.preventDefault();event.stopPropagation();row.classList.remove("drop-target");selectFolder(row,path);collectDroppedFiles(event.dataTransfer).then(items=>importLocalFiles(items,path)).catch(showError)})}
'''
if old_selected not in ui:
    raise SystemExit('selected marker mismatch')
ui = ui.replace(old_selected, new_selected)

old_connect = 'async function connect(){showError();config=await api("/api/bootstrap",{method:"POST"});sessionStorage.setItem("notionIdeKey",$("key").value);$("connection").textContent="connected";$("branchLabel").textContent=config.branch;loadedDirs.clear();$("tree").innerHTML="";await mountRoot();await restoreRunSession();updateRunButton()}\nasync function mountRoot(){const root=document.createElement("div");$("tree").appendChild(root);await renderDir(config.root,root,0)}\n'
new_connect = '''async function connect(){showError();config=await api("/api/bootstrap",{method:"POST"});sessionStorage.setItem("notionIdeKey",$("key").value);$("connection").textContent="connected";$("branchLabel").textContent=config.branch;selectedFolder=String(config.root||"");updateImportUi();await refreshExplorer();await restoreRunSession();updateRunButton()}
async function mountRoot(){const root=document.createElement("div");$("tree").appendChild(root);await renderDir(config.root,root,0)}
async function refreshExplorer(){loadedDirs.clear();selectedFolderRow=null;$("tree").innerHTML="";await mountRoot()}
'''
if old_connect not in ui:
    raise SystemExit('connect marker mismatch')
ui = ui.replace(old_connect, new_connect)

pattern = r'async function renderDir\(path,host,depth\)\{.*?\}\nasync function openFile'
replacement = '''async function renderDir(path,host,depth){let data=loadedDirs.get(path);if(!data){data=await api("/api/list?path="+encodeURIComponent(path));loadedDirs.set(path,data)}host.innerHTML="";if(depth===0){const rootRow=document.createElement("div");rootRow.className="tree-row";rootRow.style.paddingLeft="4px";const twist=document.createElement("span");twist.className="twisty";twist.textContent="▼";const name=document.createElement("span");name.className="tree-name";name.textContent=data.path||config.repo;rootRow.append(twist,name);rootRow.onclick=()=>selectFolder(rootRow,data.path||"");attachDropTarget(rootRow,data.path||"");host.appendChild(rootRow);if(selectedFolder===String(data.path||""))selectFolder(rootRow,data.path||"")}const items=data.items.slice().sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==="dir"?-1:1);for(const item of items){const wrap=document.createElement("div"),row=document.createElement("div");row.className="tree-row";row.style.paddingLeft=(8+depth*16)+"px";const twist=document.createElement("span");twist.className="twisty";twist.textContent=item.type==="dir"?"▶":"";const name=document.createElement("span");name.className="tree-name";name.textContent=item.name;row.append(twist,name);wrap.appendChild(row);host.appendChild(wrap);if(item.type==="dir"){let open=expandedDirs.has(item.path),child=null;const showChild=async()=>{if(!child){child=document.createElement("div");wrap.appendChild(child)}await renderDir(item.path,child,depth+1)};attachDropTarget(row,item.path);if(selectedFolder===item.path)selectFolder(row,item.path);if(open){twist.textContent="▼";await showChild()}row.onclick=async()=>{try{showError();selectFolder(row,item.path);open=!open;twist.textContent=open?"▼":"▶";if(open){expandedDirs.add(item.path);await showChild()}else{expandedDirs.delete(item.path);if(child){child.remove();child=null}}}catch(e){showError(e)}}}else{row.onclick=()=>{setSelected(row);selectFolder(null,parentPath(item.path));openFile(item.path).then(()=>{if(matchMedia("(max-width:800px)").matches)closeDrawer()}).catch(showError)}}}}
function bytesToBase64(buffer){const bytes=new Uint8Array(buffer);let binary="";const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary)}
function normalizeRelativePath(path){const value=String(path||"").replace(/\\\\/g,"/").replace(/^\.\\//,"").replace(/^\\/+/,"");const parts=value.split("/");if(!value||parts.some(part=>!part||part==="."||part===".."))throw new Error("invalid local file path: "+path);return parts.join("/")}
function readDirectoryEntries(reader){return new Promise((resolve,reject)=>{const entries=[];const next=()=>reader.readEntries(batch=>{if(!batch.length){resolve(entries);return}entries.push(...batch);next()},reject);next()})}
function entryFile(entry){return new Promise((resolve,reject)=>entry.file(resolve,reject))}
async function collectEntry(entry,prefix=""){if(entry.isFile){const file=await entryFile(entry);return [{file,path:prefix+file.name}]}if(entry.isDirectory){const children=await readDirectoryEntries(entry.createReader());const nextPrefix=prefix+entry.name+"/";const groups=await Promise.all(children.map(child=>collectEntry(child,nextPrefix)));return groups.flat()}return []}
async function collectDroppedFiles(dataTransfer){const items=Array.from(dataTransfer?.items||[]);const entries=items.map(item=>typeof item.webkitGetAsEntry==="function"?item.webkitGetAsEntry():null).filter(Boolean);if(entries.length){const groups=await Promise.all(entries.map(entry=>collectEntry(entry,"")));return groups.flat()}return Array.from(dataTransfer?.files||[]).map(file=>({file,path:file.webkitRelativePath||file.name}))}
async function sendImport(payload){const response=await fetch("/api/import",{method:"POST",headers:apiHeaders(true),body:JSON.stringify(payload)});const text=await response.text();let data=text;try{data=JSON.parse(text)}catch{}return {response,data}}
async function importLocalFiles(items,destination=selectedFolder){if(!config)throw new Error("connect first");if(importBusy)throw new Error("an import is already in progress");const localItems=(items||[]).filter(item=>item?.file);if(!localItems.length)return;if(localItems.length>200)throw new Error("too many files; maximum is 200 per add/drop");let total=0;for(const item of localItems){if(item.file.size>25*1024*1024)throw new Error("file too large: "+item.file.name+" (25 MB max)");total+=item.file.size}if(total>60*1024*1024)throw new Error("import batch is too large (60 MB max)");importBusy=true;updateImportUi();try{const files=[];for(let i=0;i<localItems.length;i++){const item=localItems[i];$("importFiles").textContent="Adding "+(i+1)+"/"+localItems.length;files.push({path:normalizeRelativePath(item.path||item.file.name),content_base64:bytesToBase64(await item.file.arrayBuffer())})}let result=await sendImport({destination:String(destination||""),files,overwrite:false});if(result.response.status===409&&Array.isArray(result.data?.conflicts)){const conflicts=result.data.conflicts;const preview=conflicts.slice(0,6).join("\\n");const more=conflicts.length>6?"\\n… +"+(conflicts.length-6)+" more":"";if(!confirm(conflicts.length+" file(s) already exist:\\n\\n"+preview+more+"\\n\\nOverwrite them in this import?"))return;result=await sendImport({destination:String(destination||""),files,overwrite:true})}if(!result.response.ok){const message=typeof result.data==="string"?result.data:JSON.stringify(result.data,null,2);throw new Error("HTTP "+result.response.status+": "+friendlyError(message))}appendTerminal("[IMPORT] "+result.data.count+" file(s) → "+displayFolder(destination)+" · commit "+result.data.commit_sha.slice(0,8));await refreshExplorer()}finally{importBusy=false;updateImportUi();$("filePicker").value=""}}
function openLocalFilePicker(){if(!config||importBusy)return;$("filePicker").value="";$("filePicker").click()}
async function onLocalFilesPicked(event){const files=Array.from(event.target.files||[]);if(!files.length)return;await importLocalFiles(files.map(file=>({file,path:file.name})),selectedFolder)}
async function openFile'''
ui, count = re.subn(pattern, lambda _: replacement, ui, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'renderDir replacement count={count}')

old_events = '$("connect").onclick=()=>connect().catch(showError);$("newFile").onclick=newFile;'
new_events = '$("connect").onclick=()=>connect().catch(showError);$("importFiles").onclick=openLocalFilePicker;$("filePicker").addEventListener("change",event=>onLocalFilesPicked(event).catch(showError));$("newFile").onclick=newFile;'
if old_events not in ui:
    raise SystemExit('event marker mismatch')
ui = ui.replace(old_events, new_events)

UI.write_text(ui, encoding='utf-8')
print('patched', APP)
print('patched', UI)

from pathlib import Path
import re

APP = Path('notion-ide/worker/src/app.js')
UI = Path('notion-ide/worker/src/ui.js')

app = APP.read_text(encoding='utf-8')
imp = 'import { apiImportFiles } from "./file-import.js";\n'
add = 'import { apiDeleteFiles } from "./file-delete.js";\n'
if add not in app:
    if app.count(imp) != 1:
        raise SystemExit('app import marker mismatch')
    app = app.replace(imp, imp + add)
route = '      if (url.pathname === "/api/import" && request.method === "POST") return await apiImportFiles(request, env);\n'
route_add = '      if (url.pathname === "/api/delete" && request.method === "POST") return await apiDeleteFiles(request, env);\n'
if route_add not in app:
    if app.count(route) != 1:
        raise SystemExit('app route marker mismatch')
    app = app.replace(route, route + route_add)
APP.write_text(app, encoding='utf-8')

ui = UI.read_text(encoding='utf-8')

old_css = '.pane-caption{flex:0 0 auto}.upload-target{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;font-family:var(--code-font);font-size:10px;font-weight:400;color:#666}.explorer-add{flex:0 0 auto;padding:2px 6px;font-size:11px}.tree{padding:3px 0;font-family:var(--code-font);font-size:12px}.tree-row{height:24px;display:flex;align-items:center;gap:2px;padding-right:6px;cursor:pointer;white-space:nowrap}.tree-row:hover,.tree-row.selected{background:#eee}.tree-row.folder-selected{background:#e8f1ff}.tree-row.drop-target{outline:2px solid #4a78c2;outline-offset:-2px;background:#edf4ff}'
new_css = '.pane-caption{flex:0 0 auto}.upload-target{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;font-family:var(--code-font);font-size:10px;font-weight:400;color:#666}.explorer-actions{position:relative;display:flex;gap:4px;flex:0 0 auto}.explorer-add,.explorer-delete{padding:2px 6px;font-size:11px}.add-menu{position:absolute;z-index:60;right:0;top:27px;min-width:116px;border:1px solid #999;background:#fff;box-shadow:0 2px 7px rgba(0,0,0,.15);padding:3px}.add-menu button{display:block;width:100%;border:0;padding:5px 7px;text-align:left;background:#fff}.add-menu button:hover{background:#eee}.tree{position:relative;padding:3px 0;min-height:100%;font-family:var(--code-font);font-size:12px;user-select:none}.tree-row{height:24px;display:flex;align-items:center;gap:2px;padding-right:6px;cursor:pointer;white-space:nowrap}.tree-row:hover,.tree-row.selected{background:#eee}.tree-row.multi-selected{background:#dceaff}.tree-row.folder-selected:not(.multi-selected){background:#e8f1ff}.tree-row.drop-target{outline:2px solid #4a78c2;outline-offset:-2px;background:#edf4ff}.selection-marquee{position:fixed;z-index:80;border:1px solid #4a78c2;background:rgba(74,120,194,.12);pointer-events:none}'
if old_css not in ui:
    raise SystemExit('css marker mismatch')
ui = ui.replace(old_css, new_css)

old_html = '''<span id="uploadTarget" class="upload-target" title="Upload target">/</span>
<button id="importFiles" class="explorer-add" type="button" title="Add local files to selected folder" disabled>+ Add</button>
<input id="filePicker" class="hidden" type="file" multiple>'''
new_html = '''<span id="uploadTarget" class="upload-target" title="Upload target">/</span>
<div class="explorer-actions">
<button id="importFiles" class="explorer-add" type="button" title="Add local files or a folder" disabled>+ Add</button>
<button id="deleteSelected" class="explorer-delete" type="button" title="Delete selected items" disabled>Delete</button>
<div id="addMenu" class="add-menu hidden">
<button id="addFiles" type="button">Files…</button>
<button id="addFolder" type="button">Folder…</button>
</div>
</div>
<input id="filePicker" class="hidden" type="file" multiple>
<input id="folderPicker" class="hidden" type="file" webkitdirectory directory multiple>'''
if old_html not in ui:
    raise SystemExit('html marker mismatch')
ui = ui.replace(old_html, new_html)

old_vars = 'let config=null,currentSha=null,runCommit=null,runId=null,jobId=null,pollTimer=null,selectedRow=null,selectedFolderRow=null,selectedFolder="",importBusy=false,currentPath="",lastRunCommand="",lastLifecycle="IDLE",cancelRequested=false,liveLogText="",liveLogSeq=0,lastLiveLogFetch=0;'
new_vars = 'let config=null,currentSha=null,runCommit=null,runId=null,jobId=null,pollTimer=null,selectedRow=null,selectedFolderRow=null,selectedFolder="",importBusy=false,deleteBusy=false,selectionAnchorPath="",currentPath="",lastRunCommand="",lastLifecycle="IDLE",cancelRequested=false,liveLogText="",liveLogSeq=0,lastLiveLogFetch=0;'
if old_vars not in ui:
    raise SystemExit('vars marker mismatch')
ui = ui.replace(old_vars, new_vars)

old_maps = 'const loadedDirs=new Map();\nconst expandedDirs=new Set();\nconst openFiles=new Map();'
new_maps = 'const loadedDirs=new Map();\nconst expandedDirs=new Set();\nconst selectedPaths=new Set();\nconst openFiles=new Map();'
if old_maps not in ui:
    raise SystemExit('maps marker mismatch')
ui = ui.replace(old_maps, new_maps)

start = ui.index('function parentPath(path)')
end = ui.index('function hasFileDrag(event)', start)
selection_helpers = r'''function parentPath(path){const parts=String(path||"").split("/");parts.pop();return parts.join("/")}
function displayFolder(path){return path?"/"+path:"/"}
function syncSelectionUi(){document.querySelectorAll(".tree-row[data-path]").forEach(row=>row.classList.toggle("multi-selected",selectedPaths.has(row.dataset.path)));const del=$("deleteSelected");if(del){del.disabled=!config||deleteBusy||selectedPaths.size===0;del.textContent=deleteBusy?"Deleting…":selectedPaths.size>1?"Delete ("+selectedPaths.size+")":"Delete"}}
function clearSelection(){selectedPaths.clear();selectionAnchorPath="";syncSelectionUi()}
function visibleSelectableRows(){return Array.from($("tree").querySelectorAll(".tree-row[data-path]")).filter(row=>row.offsetParent!==null&&row.dataset.path)}
function updatePathSelection(event,row,path,type){path=String(path||"");if(!path)return;const ctrl=event.ctrlKey||event.metaKey;if(event.shiftKey&&selectionAnchorPath){const rows=visibleSelectableRows(),a=rows.findIndex(r=>r.dataset.path===selectionAnchorPath),b=rows.findIndex(r=>r.dataset.path===path);if(a>=0&&b>=0){if(!ctrl)selectedPaths.clear();for(let i=Math.min(a,b);i<=Math.max(a,b);i++)selectedPaths.add(rows[i].dataset.path)}else{if(!ctrl)selectedPaths.clear();selectedPaths.add(path)}}else if(ctrl){if(selectedPaths.has(path))selectedPaths.delete(path);else selectedPaths.add(path)}else{selectedPaths.clear();selectedPaths.add(path)}selectionAnchorPath=path;if(type==="dir")selectFolder(row,path);else selectFolder(null,parentPath(path));syncSelectionUi()}
function updateImportUi(){const button=$("importFiles");if(button){button.disabled=!config||importBusy;button.textContent=importBusy?"Adding…":"+ Add"}const target=$("uploadTarget");if(target){target.textContent=displayFolder(selectedFolder);target.title="Upload target: "+displayFolder(selectedFolder)}syncSelectionUi()}
function selectFolder(row,path){if(selectedFolderRow)selectedFolderRow.classList.remove("folder-selected");selectedFolderRow=row||null;selectedFolder=String(path||"");if(selectedFolderRow)selectedFolderRow.classList.add("folder-selected");updateImportUi()}
function closeAddMenu(){$("addMenu").classList.add("hidden")}
function toggleAddMenu(){if(!config||importBusy)return;$("addMenu").classList.toggle("hidden")}
'''
ui = ui[:start] + selection_helpers + ui[end:]

# Replace renderDir through the helper that follows it.
pattern = r'async function renderDir\(path,host,depth\)\{.*?\}\nfunction bytesToBase64'
replacement = r'''async function renderDir(path,host,depth){let data=loadedDirs.get(path);if(!data){data=await api("/api/list?path="+encodeURIComponent(path));loadedDirs.set(path,data)}host.innerHTML="";if(depth===0){const rootRow=document.createElement("div");rootRow.className="tree-row";rootRow.style.paddingLeft="4px";const twist=document.createElement("span");twist.className="twisty";twist.textContent="▼";const name=document.createElement("span");name.className="tree-name";name.textContent=data.path||config.repo;rootRow.append(twist,name);rootRow.onclick=event=>{if(event.shiftKey||event.ctrlKey||event.metaKey)return;clearSelection();selectFolder(rootRow,data.path||"")};attachDropTarget(rootRow,data.path||"");host.appendChild(rootRow);if(selectedFolder===String(data.path||""))selectFolder(rootRow,data.path||"")}const items=data.items.slice().sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==="dir"?-1:1);for(const item of items){const wrap=document.createElement("div"),row=document.createElement("div");row.className="tree-row";row.dataset.path=item.path;row.dataset.type=item.type;row.style.paddingLeft=(8+depth*16)+"px";if(selectedPaths.has(item.path))row.classList.add("multi-selected");const twist=document.createElement("span");twist.className="twisty";twist.textContent=item.type==="dir"?"▶":"";const name=document.createElement("span");name.className="tree-name";name.textContent=item.name;row.append(twist,name);wrap.appendChild(row);host.appendChild(wrap);if(item.type==="dir"){let open=expandedDirs.has(item.path),child=null;const showChild=async()=>{if(!child){child=document.createElement("div");wrap.appendChild(child)}await renderDir(item.path,child,depth+1)};attachDropTarget(row,item.path);if(selectedFolder===item.path)selectFolder(row,item.path);if(open){twist.textContent="▼";await showChild()}row.onclick=async event=>{try{showError();updatePathSelection(event,row,item.path,"dir");if(event.shiftKey||event.ctrlKey||event.metaKey)return;open=!open;twist.textContent=open?"▼":"▶";if(open){expandedDirs.add(item.path);await showChild()}else{expandedDirs.delete(item.path);if(child){child.remove();child=null}}}catch(e){showError(e)}}}else{row.onclick=event=>{updatePathSelection(event,row,item.path,"file");if(event.shiftKey||event.ctrlKey||event.metaKey)return;setSelected(row);openFile(item.path).then(()=>{if(matchMedia("(max-width:800px)").matches)closeDrawer()}).catch(showError)}}}}
function bytesToBase64'''
ui, n = re.subn(pattern, lambda _: replacement, ui, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'renderDir replacement count={n}')

# Insert folder picker, delete, and marquee helpers after local file picker handlers.
marker = 'async function onLocalFilesPicked(event){const files=Array.from(event.target.files||[]);if(!files.length)return;await importLocalFiles(files.map(file=>({file,path:file.name})),selectedFolder)}\n'
extra = r'''function openLocalFolderPicker(){if(!config||importBusy)return;closeAddMenu();$("folderPicker").value="";$("folderPicker").click()}
async function onLocalFolderPicked(event){const files=Array.from(event.target.files||[]);if(!files.length)return;await importLocalFiles(files.map(file=>({file,path:file.webkitRelativePath||file.name})),selectedFolder)}
function pathIsDeleted(path,roots){return roots.some(root=>path===root||path.startsWith(root+"/"))}
function pruneDeletedTabs(roots){const activeWasDeleted=currentPath&&pathIsDeleted(currentPath,roots);for(const path of [...openFiles.keys()])if(pathIsDeleted(path,roots))openFiles.delete(path);if(activeWasDeleted){currentPath="";currentSha=null;const next=[...openFiles.keys()][0]||"";if(next)showBuffer(next);else{$("path").value="";$("path").readOnly=true;$("editor").value="";refreshHighlight();updateSaveState();renderTabs()}}else renderTabs()}
async function deleteSelection(){if(!config||deleteBusy||selectedPaths.size===0)return;const paths=[...selectedPaths];const preview=paths.slice(0,8).join("\n");const more=paths.length>8?"\n… +"+(paths.length-8)+" more":"";if(!confirm("Delete "+paths.length+" selected item(s) from "+config.branch+"?\n\n"+preview+more+"\n\nThis creates one Git commit."))return;deleteBusy=true;syncSelectionUi();try{const d=await api("/api/delete",{method:"POST",body:JSON.stringify({paths})});appendTerminal("[DELETE] "+d.count+" item(s) · commit "+d.commit_sha.slice(0,8));pruneDeletedTabs(d.paths||paths);selectedPaths.clear();selectionAnchorPath="";await refreshExplorer();syncSelectionUi()}finally{deleteBusy=false;syncSelectionUi()}}
function initMarqueeSelection(){const tree=$("tree"),box=document.createElement("div");box.className="selection-marquee hidden";document.body.appendChild(box);let active=false,startX=0,startY=0,base=new Set();const update=(x,y)=>{const left=Math.min(startX,x),top=Math.min(startY,y),right=Math.max(startX,x),bottom=Math.max(startY,y);box.style.left=left+"px";box.style.top=top+"px";box.style.width=(right-left)+"px";box.style.height=(bottom-top)+"px";selectedPaths.clear();for(const p of base)selectedPaths.add(p);for(const row of visibleSelectableRows()){const r=row.getBoundingClientRect();if(r.right>=left&&r.left<=right&&r.bottom>=top&&r.top<=bottom)selectedPaths.add(row.dataset.path)}syncSelectionUi()};tree.addEventListener("pointerdown",event=>{if(event.button!==0||event.target.closest(".tree-row")||hasFileDrag(event))return;active=true;startX=event.clientX;startY=event.clientY;base=(event.ctrlKey||event.metaKey)?new Set(selectedPaths):new Set();if(!(event.ctrlKey||event.metaKey))selectedPaths.clear();box.classList.remove("hidden");box.style.left=startX+"px";box.style.top=startY+"px";box.style.width="0px";box.style.height="0px";tree.setPointerCapture(event.pointerId);event.preventDefault()});tree.addEventListener("pointermove",event=>{if(active)update(event.clientX,event.clientY)});tree.addEventListener("pointerup",event=>{if(!active)return;update(event.clientX,event.clientY);active=false;box.classList.add("hidden");try{tree.releasePointerCapture(event.pointerId)}catch{};const rows=visibleSelectableRows().filter(row=>selectedPaths.has(row.dataset.path));if(rows.length)selectionAnchorPath=rows[rows.length-1].dataset.path});tree.addEventListener("pointercancel",()=>{active=false;box.classList.add("hidden")})}
'''
if marker not in ui:
    raise SystemExit('picker handler marker mismatch')
ui = ui.replace(marker, marker + extra)

# Make Files button close menu before opening picker.
old_picker = 'function openLocalFilePicker(){if(!config||importBusy)return;$("filePicker").value="";$("filePicker").click()}'
new_picker = 'function openLocalFilePicker(){if(!config||importBusy)return;closeAddMenu();$("filePicker").value="";$("filePicker").click()}'
if old_picker not in ui:
    raise SystemExit('picker marker mismatch')
ui = ui.replace(old_picker, new_picker)

# Update connect to clear multi-selection.
old_connect_piece = '$("branchLabel").textContent=config.branch;selectedFolder=String(config.root||"");updateImportUi();await refreshExplorer();'
new_connect_piece = '$("branchLabel").textContent=config.branch;selectedPaths.clear();selectionAnchorPath="";selectedFolder=String(config.root||"");updateImportUi();await refreshExplorer();'
if old_connect_piece not in ui:
    raise SystemExit('connect piece mismatch')
ui = ui.replace(old_connect_piece, new_connect_piece)

old_events = '$("connect").onclick=()=>connect().catch(showError);$("importFiles").onclick=openLocalFilePicker;$("filePicker").addEventListener("change",event=>onLocalFilesPicked(event).catch(showError));$("newFile").onclick=newFile;'
new_events = '$("connect").onclick=()=>connect().catch(showError);$("importFiles").onclick=toggleAddMenu;$("addFiles").onclick=openLocalFilePicker;$("addFolder").onclick=openLocalFolderPicker;$("filePicker").addEventListener("change",event=>onLocalFilesPicked(event).catch(showError));$("folderPicker").addEventListener("change",event=>onLocalFolderPicked(event).catch(showError));$("deleteSelected").onclick=()=>deleteSelection().catch(showError);$("newFile").onclick=newFile;'
if old_events not in ui:
    raise SystemExit('events marker mismatch')
ui = ui.replace(old_events, new_events)

old_tail = 'initResizers();refreshHighlight();renderTabs();const saved=sessionStorage.getItem("notionIdeKey");'
new_tail = 'document.addEventListener("pointerdown",event=>{if(!event.target.closest(".explorer-actions"))closeAddMenu()});initResizers();initMarqueeSelection();refreshHighlight();renderTabs();const saved=sessionStorage.getItem("notionIdeKey");'
if old_tail not in ui:
    raise SystemExit('init marker mismatch')
ui = ui.replace(old_tail, new_tail)

UI.write_text(ui, encoding='utf-8')
print('patched selection, folder picker, delete')

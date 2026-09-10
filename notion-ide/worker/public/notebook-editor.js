(() => {
  const NOTEBOOK_RE = /\.ipynb$/i;
  const stack = document.querySelector('.editor-stack');
  if (!stack) return;

  const style = document.createElement('style');
  style.textContent = `
  .nb-shell{position:absolute;inset:0;z-index:10;overflow:auto;background:#f5f6f8;padding:12px 14px 36px}.nb-shell.hidden{display:none}.nb-toolbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:6px;padding:7px 8px;margin:-12px -14px 12px;background:rgba(255,255,255,.96);border-bottom:1px solid #c9cdd2}.nb-toolbar strong{font-size:12px}.nb-toolbar button{padding:4px 7px;font-size:11px}.nb-toolbar .nb-grow{flex:1}.nb-meta{font-size:10px;color:#666}.nb-cells{max-width:980px;margin:0 auto}.nb-cell{background:#fff;border:1px solid #c9cdd2;margin:0 0 10px;box-shadow:0 1px 2px rgba(0,0,0,.03)}.nb-cell:focus-within{border-color:#8aa8d8}.nb-cell-head{display:flex;align-items:center;gap:5px;min-height:30px;padding:4px 6px;border-bottom:1px solid #e0e2e5;background:#fafafa}.nb-cell-head select,.nb-cell-head button{padding:3px 6px;font-size:10px}.nb-cell-label{font-family:var(--code-font);font-size:10px;color:#666;min-width:44px}.nb-cell-actions{margin-left:auto;display:flex;gap:4px}.nb-code-wrap{position:relative;min-height:54px;background:#fff}.nb-code-highlight,.nb-code-editor{width:100%;margin:0;padding:9px 10px;border:0;font-family:var(--code-font);font-size:12.5px;line-height:1.5;tab-size:4;white-space:pre;overflow:auto}.nb-code-highlight{position:absolute;z-index:1;inset:0;pointer-events:none;background:#fff;color:#111}.nb-code-editor{position:relative;z-index:2;display:block;resize:none;outline:0;background:transparent;color:transparent;caret-color:#111;min-height:54px}.nb-code-editor::selection{background:rgba(130,160,210,.35)}.nb-markdown-render{padding:10px 12px;min-height:46px;line-height:1.5;overflow-wrap:anywhere}.nb-markdown-render h1,.nb-markdown-render h2,.nb-markdown-render h3,.nb-markdown-render h4{margin:.35em 0 .45em}.nb-markdown-render p{margin:.45em 0}.nb-markdown-render pre{padding:8px 10px;overflow:auto;background:#f6f8fa;border:1px solid #e1e4e8;font-family:var(--code-font)}.nb-markdown-render code{font-family:var(--code-font);background:#f2f3f5;padding:1px 3px}.nb-markdown-render blockquote{margin:.5em 0;padding-left:10px;border-left:3px solid #c6cbd1;color:#555}.nb-markdown-render ul,.nb-markdown-render ol{margin:.45em 0;padding-left:24px}.nb-markdown-editor{display:block;width:100%;min-height:90px;border:0;padding:10px 12px;resize:vertical;outline:0;font-family:var(--code-font);font-size:12.5px;line-height:1.5}.nb-output{border-top:1px solid #e5e7ea;background:#fbfbfc;padding:8px 10px;overflow:auto}.nb-output pre{margin:0 0 6px;white-space:pre-wrap;font-family:var(--code-font);font-size:11.5px;line-height:1.45}.nb-output img{display:block;max-width:100%;height:auto;margin:4px 0}.nb-output-error{color:#9a1b1b}.nb-output-note{font-size:10px;color:#666}.nb-empty{max-width:980px;margin:30px auto;padding:24px;text-align:center;border:1px dashed #bbb;background:#fff;color:#666}.nb-raw{max-width:980px;margin:0 auto;padding:10px;background:#111;color:#eee;white-space:pre-wrap;word-break:break-word;font-family:var(--code-font);font-size:11px;line-height:1.45}.nb-invalid{max-width:980px;margin:20px auto;padding:14px;border:1px solid #b44;background:#fff5f5;color:#900}.nb-hidden-editor{display:none!important}@media(max-width:800px){.nb-shell{padding:8px 7px 30px}.nb-toolbar{margin:-8px -7px 8px;overflow:auto;white-space:nowrap}.nb-cell-actions button{padding:3px 5px}.nb-cell-head{overflow:auto}.nb-cells{max-width:none}}
  `;
  document.head.appendChild(style);

  const shell = document.createElement('div');
  shell.id = 'notebookShell';
  shell.className = 'nb-shell hidden';
  stack.appendChild(shell);

  const baseShowBuffer = showBuffer;
  const baseCaptureCurrentBuffer = captureCurrentBuffer;
  const baseSaveFile = saveFile;
  const notebookDocs = new WeakMap();
  let rawMode = false;

  function isNotebookPath(path) { return NOTEBOOK_RE.test(path || ''); }
  function sourceText(cell) { return Array.isArray(cell?.source) ? cell.source.join('') : String(cell?.source ?? ''); }
  function toSourceArray(text) { return String(text).match(/[^\n]*\n|[^\n]+$/g) || []; }
  function setCellSource(cell, text) { cell.source = toSourceArray(text); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function textValue(value) { return Array.isArray(value) ? value.join('') : String(value ?? ''); }
  function notebookBuffer() { const b = currentBuffer(); return b && isNotebookPath(b.path) ? b : null; }

  function ensureNotebookDoc(buffer) {
    if (notebookDocs.has(buffer)) return notebookDocs.get(buffer);
    let doc;
    try { doc = JSON.parse(buffer.content); }
    catch (error) { doc = { __invalid: true, __error: String(error?.message || error), __raw: buffer.content }; }
    if (!doc.__invalid) {
      if (!Array.isArray(doc.cells)) doc.cells = [];
      if (!doc.metadata || typeof doc.metadata !== 'object') doc.metadata = {};
      if (!Number.isInteger(doc.nbformat)) doc.nbformat = 4;
      if (!Number.isInteger(doc.nbformat_minor)) doc.nbformat_minor = 0;
    }
    notebookDocs.set(buffer, doc);
    return doc;
  }

  function serializeNotebook(buffer) {
    const doc = ensureNotebookDoc(buffer);
    if (doc.__invalid) return String(doc.__raw ?? buffer.content ?? '');
    return JSON.stringify(doc);
  }

  function markNotebookDirty() {
    const b = notebookBuffer();
    if (!b) return;
    b.content = serializeNotebook(b);
    if (!b.dirty) {
      b.dirty = true;
      updateSaveState();
      renderTabs();
    }
  }

  function inlineMarkdown(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return s;
  }

  function renderMarkdown(text) {
    const lines = String(text || '').split('\n');
    let html = '', inFence = false, fence = [], listType = '';
    const closeList = () => { if (listType) { html += `</${listType}>`; listType = ''; } };
    for (const line of lines) {
      if (/^```/.test(line)) {
        if (!inFence) { closeList(); inFence = true; fence = []; }
        else { html += `<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`; inFence = false; fence = []; }
        continue;
      }
      if (inFence) { fence.push(line); continue; }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { closeList(); const n=h[1].length; html += `<h${n}>${inlineMarkdown(h[2])}</h${n}>`; continue; }
      const quote = line.match(/^>\s?(.*)$/);
      if (quote) { closeList(); html += `<blockquote>${inlineMarkdown(quote[1])}</blockquote>`; continue; }
      const ul = line.match(/^\s*[-*+]\s+(.*)$/);
      if (ul) { if (listType && listType !== 'ul') closeList(); if (!listType) { listType='ul'; html+='<ul>'; } html += `<li>${inlineMarkdown(ul[1])}</li>`; continue; }
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ol) { if (listType && listType !== 'ol') closeList(); if (!listType) { listType='ol'; html+='<ol>'; } html += `<li>${inlineMarkdown(ol[1])}</li>`; continue; }
      closeList();
      if (/^\s*---+\s*$/.test(line)) { html += '<hr>'; continue; }
      if (!line.trim()) { html += '<div style="height:.35em"></div>'; continue; }
      html += `<p>${inlineMarkdown(line)}</p>`;
    }
    closeList();
    if (inFence) html += `<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`;
    return html || '<span class="nb-output-note">Empty markdown cell</span>';
  }

  function resizeCodeEditor(editor, highlight) {
    editor.style.height = 'auto';
    const lineCount = Math.max(2, editor.value.split('\n').length);
    const height = Math.min(700, Math.max(54, lineCount * 18.75 + 20));
    editor.style.height = height + 'px';
    highlight.style.height = height + 'px';
  }

  function renderDataOutput(data, box) {
    if (!data || typeof data !== 'object') return false;
    if (data['image/png']) {
      const img=document.createElement('img'); img.alt='notebook output'; img.src='data:image/png;base64,'+textValue(data['image/png']).replace(/\s/g,''); box.appendChild(img); return true;
    }
    if (data['image/jpeg']) {
      const img=document.createElement('img'); img.alt='notebook output'; img.src='data:image/jpeg;base64,'+textValue(data['image/jpeg']).replace(/\s/g,''); box.appendChild(img); return true;
    }
    if (data['text/plain'] != null) { const pre=document.createElement('pre'); pre.textContent=textValue(data['text/plain']); box.appendChild(pre); return true; }
    if (data['application/json'] != null) { const pre=document.createElement('pre'); try{pre.textContent=JSON.stringify(data['application/json'],null,2)}catch{pre.textContent=String(data['application/json'])} box.appendChild(pre); return true; }
    if (data['text/html'] != null) { const pre=document.createElement('pre'); pre.textContent=textValue(data['text/html']); box.appendChild(pre); return true; }
    return false;
  }

  function renderOutputs(cell, host) {
    const outputs = Array.isArray(cell.outputs) ? cell.outputs : [];
    if (!outputs.length) return;
    const box=document.createElement('div'); box.className='nb-output';
    for (const out of outputs) {
      if (out.output_type === 'stream') { const pre=document.createElement('pre'); pre.textContent=textValue(out.text); box.appendChild(pre); continue; }
      if (out.output_type === 'error') { const pre=document.createElement('pre'); pre.className='nb-output-error'; pre.textContent=Array.isArray(out.traceback)?out.traceback.join('\n'):String(out.evalue||out.ename||'Notebook error'); box.appendChild(pre); continue; }
      if (out.output_type === 'execute_result' || out.output_type === 'display_data') { if (!renderDataOutput(out.data, box)) { const note=document.createElement('div'); note.className='nb-output-note'; note.textContent='Output type not rendered'; box.appendChild(note); } continue; }
      const note=document.createElement('div'); note.className='nb-output-note'; note.textContent=`Unsupported output: ${out.output_type || 'unknown'}`; box.appendChild(note);
    }
    host.appendChild(box);
  }

  function moveCell(doc, index, delta) {
    const to=index+delta; if(to<0||to>=doc.cells.length)return; const [cell]=doc.cells.splice(index,1); doc.cells.splice(to,0,cell); markNotebookDirty(); renderNotebook();
  }
  function deleteCell(doc,index){ if(!confirm(`Delete cell ${index+1}?`))return; doc.cells.splice(index,1); markNotebookDirty(); renderNotebook(); }
  function newCell(type='code') { const cell={cell_type:type,metadata:{},source:[]}; if(type==='code'){cell.execution_count=null;cell.outputs=[];} if(globalThis.crypto?.randomUUID)cell.id=crypto.randomUUID().replace(/-/g,'').slice(0,32); return cell; }
  function addCell(type) { const b=notebookBuffer(); if(!b)return; const doc=ensureNotebookDoc(b); if(doc.__invalid)return; doc.cells.push(newCell(type)); markNotebookDirty(); renderNotebook(); requestAnimationFrame(()=>shell.scrollTo({top:shell.scrollHeight,behavior:'smooth'})); }
  function changeCellType(doc,cell,type){ if(cell.cell_type===type)return; cell.cell_type=type; if(type==='code'){ if(!Array.isArray(cell.outputs))cell.outputs=[]; if(!('execution_count' in cell))cell.execution_count=null; } else { delete cell.outputs; delete cell.execution_count; } markNotebookDirty(); renderNotebook(); }

  function renderCodeCell(doc, cell, index, body) {
    const wrap=document.createElement('div'); wrap.className='nb-code-wrap';
    const high=document.createElement('pre'); high.className='nb-code-highlight';
    const edit=document.createElement('textarea'); edit.className='nb-code-editor'; edit.spellcheck=false; edit.wrap='off'; edit.value=sourceText(cell);
    const sync=()=>{ high.innerHTML=highlightPython(edit.value); high.scrollTop=edit.scrollTop; high.scrollLeft=edit.scrollLeft; resizeCodeEditor(edit,high); };
    edit.addEventListener('input',()=>{setCellSource(cell,edit.value);markNotebookDirty();sync()});
    edit.addEventListener('scroll',()=>{high.scrollTop=edit.scrollTop;high.scrollLeft=edit.scrollLeft});
    edit.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();const s=edit.selectionStart,e=edit.selectionEnd;edit.setRangeText('    ',s,e,'end');setCellSource(cell,edit.value);markNotebookDirty();sync()}});
    wrap.append(high,edit); body.appendChild(wrap); sync(); renderOutputs(cell,body);
  }

  function renderMarkdownCell(doc, cell, index, body, editButton) {
    const render=document.createElement('div'); render.className='nb-markdown-render'; render.innerHTML=renderMarkdown(sourceText(cell));
    const editor=document.createElement('textarea'); editor.className='nb-markdown-editor hidden'; editor.spellcheck=false; editor.value=sourceText(cell);
    const setEditing=(editing)=>{render.classList.toggle('hidden',editing);editor.classList.toggle('hidden',!editing);editButton.textContent=editing?'Done':'Edit';if(editing){editor.focus();editor.selectionStart=editor.value.length;editor.selectionEnd=editor.value.length}else render.innerHTML=renderMarkdown(editor.value)};
    editButton.onclick=()=>setEditing(!render.classList.contains('hidden'));
    render.ondblclick=()=>setEditing(true);
    editor.addEventListener('input',()=>{setCellSource(cell,editor.value);markNotebookDirty()});
    body.append(render,editor);
  }

  function renderCell(doc, cell, index) {
    const card=document.createElement('section'); card.className='nb-cell';
    const head=document.createElement('div'); head.className='nb-cell-head';
    const label=document.createElement('span'); label.className='nb-cell-label'; label.textContent=cell.cell_type==='code'?(cell.execution_count==null?'[ ]':`[${cell.execution_count}]`):'MD';
    const type=document.createElement('select'); type.innerHTML='<option value="code">Code</option><option value="markdown">Markdown</option>'; type.value=cell.cell_type==='markdown'?'markdown':'code'; type.onchange=()=>changeCellType(doc,cell,type.value);
    const actions=document.createElement('span'); actions.className='nb-cell-actions';
    const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='Move cell up';up.disabled=index===0;up.onclick=()=>moveCell(doc,index,-1);
    const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='Move cell down';down.disabled=index===doc.cells.length-1;down.onclick=()=>moveCell(doc,index,1);
    const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.classList.toggle('hidden',cell.cell_type!=='markdown');
    const del=document.createElement('button');del.type='button';del.textContent='Delete';del.onclick=()=>deleteCell(doc,index);
    actions.append(up,down,edit,del);head.append(label,type,actions);card.appendChild(head);
    const body=document.createElement('div'); card.appendChild(body);
    if(cell.cell_type==='markdown')renderMarkdownCell(doc,cell,index,body,edit);else renderCodeCell(doc,cell,index,body);
    return card;
  }

  function renderNotebook() {
    const b=notebookBuffer(); if(!b)return;
    const doc=ensureNotebookDoc(b);
    shell.innerHTML='';
    const toolbar=document.createElement('div');toolbar.className='nb-toolbar';
    const title=document.createElement('strong');title.textContent='NOTEBOOK';
    const meta=document.createElement('span');meta.className='nb-meta';meta.textContent=doc.__invalid?'invalid JSON':`${doc.cells.length} cells · nbformat ${doc.nbformat}.${doc.nbformat_minor}`;
    const grow=document.createElement('span');grow.className='nb-grow';
    const addCode=document.createElement('button');addCode.type='button';addCode.textContent='+ Code';addCode.disabled=Boolean(doc.__invalid);addCode.onclick=()=>addCell('code');
    const addMd=document.createElement('button');addMd.type='button';addMd.textContent='+ Markdown';addMd.disabled=Boolean(doc.__invalid);addMd.onclick=()=>addCell('markdown');
    const raw=document.createElement('button');raw.type='button';raw.textContent=rawMode?'Notebook':'Raw JSON';raw.onclick=()=>{rawMode=!rawMode;renderNotebook()};
    toolbar.append(title,meta,grow,addCode,addMd,raw);shell.appendChild(toolbar);
    if(doc.__invalid){const err=document.createElement('div');err.className='nb-invalid';err.textContent=`This file is not valid notebook JSON: ${doc.__error}`;shell.appendChild(err);const pre=document.createElement('pre');pre.className='nb-raw';pre.textContent=String(doc.__raw||'');shell.appendChild(pre);return;}
    if(rawMode){const pre=document.createElement('pre');pre.className='nb-raw';pre.textContent=JSON.stringify(doc,null,2);shell.appendChild(pre);return;}
    const cells=document.createElement('div');cells.className='nb-cells';for(let i=0;i<doc.cells.length;i++)cells.appendChild(renderCell(doc,doc.cells[i],i));shell.appendChild(cells);
    if(!doc.cells.length){const empty=document.createElement('div');empty.className='nb-empty';empty.textContent='Empty notebook — add a Code or Markdown cell.';shell.appendChild(empty)}
  }

  function setNotebookMode(active) {
    shell.classList.toggle('hidden',!active);
    for(const id of ['editor','highlight','lineNumbers','activeLine']) { const el=$(id); if(el)el.classList.toggle('nb-hidden-editor',active); }
  }

  captureCurrentBuffer = function() {
    const b=currentBuffer();
    if(b && isNotebookPath(b.path)){b.content=serializeNotebook(b);return;}
    return baseCaptureCurrentBuffer();
  };

  showBuffer = function(path) {
    const b=openFiles.get(path);
    if(!b || !isNotebookPath(path)){setNotebookMode(false);rawMode=false;return baseShowBuffer(path);}
    currentPath=path;currentSha=b.sha;$("path").value=path;$("path").readOnly=true;setNotebookMode(true);rawMode=false;ensureNotebookDoc(b);renderNotebook();updateSaveState();renderTabs();updateRunButton();
  };

  saveFile = async function() {
    const b=notebookBuffer();
    if(!b)return baseSaveFile();
    showError();if(!config)throw new Error('connect first');
    const content=serializeNotebook(b);const path=b.path;
    const d=await api('/api/file',{method:'PUT',body:JSON.stringify({path,content,sha:b.sha})});
    b.sha=d.sha;b.content=content;b.dirty=false;currentSha=d.sha;$("saveState").textContent='saved '+d.commit_sha.slice(0,8);renderTabs();renderNotebook();return d;
  };

  const baseCloseTab=closeTab;
  closeTab=function(path){const wasNotebook=isNotebookPath(path)&&path===currentPath;const result=baseCloseTab(path);if(wasNotebook&&!currentPath)setNotebookMode(false);return result};

  const baseUpdateRunButton=updateRunButton;
  updateRunButton=function(){baseUpdateRunButton();if(isNotebookPath(currentPath))$("run").disabled=true};

  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'&&isNotebookPath(currentPath)){
      event.preventDefault();event.stopImmediatePropagation();saveFile().catch(showError);
    }
  },true);
})();

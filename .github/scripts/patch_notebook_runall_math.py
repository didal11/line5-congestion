from pathlib import Path

UI = Path('notion-ide/worker/src/ui.js')
NB = Path('notion-ide/worker/public/notebook-editor.js')

ui = UI.read_text(encoding='utf-8')
replacements = [
    ('function isPythonPath(path){return /\\.py$/i.test(path||"")}',
     'function isPythonPath(path){return /\\.(?:py|ipynb)$/i.test(path||"")}'),
    ('if(!path||!isPythonPath(path))throw new Error("select a .py file first");',
     'if(!path||!isPythonPath(path))throw new Error("select a .py or .ipynb file first");'),
    ('async function pythonCommand(entrypoint){const python=".venv/bin/python";if(!entrypoint.endsWith(".py"))return python+" -m "+entrypoint;',
     'async function pythonCommand(entrypoint){const python=".venv/bin/python";if(/\\.ipynb$/i.test(entrypoint))return python+" notion-ide/notebook_exec.py "+entrypoint;if(!entrypoint.endsWith(".py"))return python+" -m "+entrypoint;'),
]
for old, new in replacements:
    if old not in ui:
        raise SystemExit(f'ui marker not found: {old[:80]}')
    ui = ui.replace(old, new, 1)
UI.write_text(ui, encoding='utf-8')

nb = NB.read_text(encoding='utf-8')

old = """  function notebookBuffer() { const b = currentBuffer(); return b && isNotebookPath(b.path) ? b : null; }\n\n  function ensureNotebookDoc(buffer) {"""
new = r'''  function notebookBuffer() { const b = currentBuffer(); return b && isNotebookPath(b.path) ? b : null; }

  let mathJaxPromise = null;
  function ensureMathJax() {
    if (globalThis.MathJax?.typesetPromise) return Promise.resolve(globalThis.MathJax);
    if (mathJaxPromise) return mathJaxPromise;
    globalThis.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        processEscapes: true,
      },
      options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] },
    };
    mathJaxPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'notebookMathJax';
      script.async = true;
      script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
      script.onload = () => resolve(globalThis.MathJax);
      script.onerror = () => reject(new Error('MathJax failed to load'));
      document.head.appendChild(script);
    });
    return mathJaxPromise;
  }

  async function typesetMath(root) {
    try {
      const mathJax = await ensureMathJax();
      if (mathJax.typesetClear) mathJax.typesetClear([root]);
      await mathJax.typesetPromise([root]);
    } catch (error) {
      console.warn('Notebook math rendering unavailable', error);
    }
  }

  function protectInlineMath(text) {
    const items = [];
    const tokenized = String(text ?? '').replace(/(\\\\\([^\n]*?\\\\\)|\$[^$\n]+?\$)/g, value => {
      const token = `NBMATHTOKEN${items.length}END`;
      items.push(value);
      return token;
    });
    return { tokenized, items };
  }

  function restoreMathTokens(html, items) {
    return html.replace(/NBMATHTOKEN(\d+)END/g, (_, index) => escapeHtml(items[Number(index)] || ''));
  }

  function ensureNotebookDoc(buffer) {'''
if old not in nb:
    raise SystemExit('notebook helper marker not found')
nb = nb.replace(old, new, 1)

old = r'''  function inlineMarkdown(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return s;
  }

  function renderMarkdown(text) {
    const lines = String(text || '').split('\n');'''
new = r'''  function inlineMarkdown(text) {
    const protectedMath = protectInlineMath(text);
    let s = escapeHtml(protectedMath.tokenized);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return restoreMathTokens(s, protectedMath.items);
  }

  function renderMarkdown(text) {
    const displayMath = [];
    const normalized = String(text || '').replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g, value => {
      const token = `NBMATHBLOCK${displayMath.length}END`;
      displayMath.push(value);
      return token;
    });
    const lines = normalized.split('\n');'''
if old not in nb:
    raise SystemExit('inline markdown marker not found')
nb = nb.replace(old, new, 1)

old = """    return html || '<span class=\"nb-output-note\">Empty markdown cell</span>';\n  }"""
new = """    html = html.replace(/NBMATHBLOCK(\\d+)END/g, (_, index) => escapeHtml(displayMath[Number(index)] || ''));\n    return html || '<span class=\"nb-output-note\">Empty markdown cell</span>';\n  }"""
if old not in nb:
    raise SystemExit('render markdown return marker not found')
nb = nb.replace(old, new, 1)

old = "wrap.append(high,edit); body.appendChild(wrap); sync(); renderOutputs(cell,body);"
new = "wrap.append(high,edit); body.appendChild(wrap); sync();"
if old not in nb:
    raise SystemExit('saved outputs render marker not found')
nb = nb.replace(old, new, 1)

old = "label.textContent=cell.cell_type==='code'?(cell.execution_count==null?'[ ]':`[${cell.execution_count}]`):'MD';"
new = "label.textContent=cell.cell_type==='code'?'PY':'MD';"
if old not in nb:
    raise SystemExit('execution count label marker not found')
nb = nb.replace(old, new, 1)

old = """    const setEditing=(editing)=>{render.classList.toggle('hidden',editing);editor.classList.toggle('hidden',!editing);editButton.textContent=editing?'Done':'Edit';if(editing){editor.focus();editor.selectionStart=editor.value.length;editor.selectionEnd=editor.value.length}else render.innerHTML=renderMarkdown(editor.value)};"""
new = """    const setEditing=(editing)=>{render.classList.toggle('hidden',editing);editor.classList.toggle('hidden',!editing);editButton.textContent=editing?'Done':'Edit';if(editing){editor.focus();editor.selectionStart=editor.value.length;editor.selectionEnd=editor.value.length}else{render.innerHTML=renderMarkdown(editor.value);typesetMath(render)}};"""
if old not in nb:
    raise SystemExit('markdown editing marker not found')
nb = nb.replace(old, new, 1)

old = """    const addCode=document.createElement('button');addCode.type='button';addCode.textContent='+ Code';addCode.disabled=Boolean(doc.__invalid);addCode.onclick=()=>addCell('code');
    const addMd=document.createElement('button');addMd.type='button';addMd.textContent='+ Markdown';addMd.disabled=Boolean(doc.__invalid);addMd.onclick=()=>addCell('markdown');
    const raw=document.createElement('button');raw.type='button';raw.textContent=rawMode?'Notebook':'Raw JSON';raw.onclick=()=>{rawMode=!rawMode;renderNotebook()};
    toolbar.append(title,meta,grow,addCode,addMd,raw);shell.appendChild(toolbar);"""
new = """    const runAll=document.createElement('button');runAll.type='button';runAll.textContent='Run All ▶';runAll.title='Save and run every Python code cell from top to bottom in one process';runAll.disabled=Boolean(doc.__invalid);runAll.onclick=async()=>{try{if(b.dirty)await saveFile();await run()}catch(error){showError(error)}};
    const addCode=document.createElement('button');addCode.type='button';addCode.textContent='+ Code';addCode.disabled=Boolean(doc.__invalid);addCode.onclick=()=>addCell('code');
    const addMd=document.createElement('button');addMd.type='button';addMd.textContent='+ Markdown';addMd.disabled=Boolean(doc.__invalid);addMd.onclick=()=>addCell('markdown');
    toolbar.append(title,meta,grow,runAll,addCode,addMd);shell.appendChild(toolbar);"""
if old not in nb:
    raise SystemExit('toolbar marker not found')
nb = nb.replace(old, new, 1)

old = """    if(rawMode){const pre=document.createElement('pre');pre.className='nb-raw';pre.textContent=JSON.stringify(doc,null,2);shell.appendChild(pre);return;}
    const cells=document.createElement('div');cells.className='nb-cells';for(let i=0;i<doc.cells.length;i++)cells.appendChild(renderCell(doc,doc.cells[i],i));shell.appendChild(cells);
    if(!doc.cells.length){const empty=document.createElement('div');empty.className='nb-empty';empty.textContent='Empty notebook — add a Code or Markdown cell.';shell.appendChild(empty)}"""
new = """    const cells=document.createElement('div');cells.className='nb-cells';for(let i=0;i<doc.cells.length;i++)cells.appendChild(renderCell(doc,doc.cells[i],i));shell.appendChild(cells);
    if(!doc.cells.length){const empty=document.createElement('div');empty.className='nb-empty';empty.textContent='Empty notebook — add a Code or Markdown cell.';shell.appendChild(empty)}
    typesetMath(shell);"""
if old not in nb:
    raise SystemExit('raw view/render notebook marker not found')
nb = nb.replace(old, new, 1)

old = """  function setNotebookMode(active) {
    shell.classList.toggle('hidden',!active);
    for(const id of ['editor','highlight','lineNumbers','activeLine']) { const el=$(id); if(el)el.classList.toggle('nb-hidden-editor',active); }
  }"""
new = """  function setNotebookMode(active) {
    shell.classList.toggle('hidden',!active);
    for(const id of ['editor','highlight','lineNumbers','activeLine']) { const el=$(id); if(el)el.classList.toggle('nb-hidden-editor',active); }
    if($('run')) $('run').textContent=active?'Run All ▶':'Run ▶';
  }"""
if old not in nb:
    raise SystemExit('notebook mode marker not found')
nb = nb.replace(old, new, 1)

NB.write_text(nb, encoding='utf-8')
print('patched notebook run-all, stale output hiding, and MathJax rendering')

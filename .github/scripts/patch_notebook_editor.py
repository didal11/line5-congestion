from pathlib import Path

APP = Path('notion-ide/worker/src/app.js')
app = APP.read_text(encoding='utf-8')

old_asset = 'if ((url.pathname.startsWith("/fonts/") || url.pathname === "/ide-productivity.js") && request.method === "GET" && env.ASSETS) {'
new_asset = 'if ((url.pathname.startsWith("/fonts/") || url.pathname === "/ide-productivity.js" || url.pathname === "/notebook-editor.js") && request.method === "GET" && env.ASSETS) {'
if old_asset not in app:
    raise SystemExit('asset marker not found')
app = app.replace(old_asset, new_asset, 1)

old_root = 'return new Response(UI.replace("</body>", "<script src=\\"/ide-productivity.js\\"></script></body>"), { headers: { "content-type": "text/html; charset=utf-8" } });'
new_root = 'return new Response(UI.replace("</body>", "<script src=\\"/ide-productivity.js\\"></script><script src=\\"/notebook-editor.js\\"></script></body>"), { headers: { "content-type": "text/html; charset=utf-8" } });'
if old_root not in app:
    raise SystemExit('root marker not found')
app = app.replace(old_root, new_root, 1)

APP.write_text(app, encoding='utf-8')
print('patched notebook asset and script injection')

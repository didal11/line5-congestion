from pathlib import Path

APP = Path('notion-ide/worker/src/app.js')
WRANGLER = Path('notion-ide/worker/wrangler.toml')
VALIDATE = Path('.github/workflows/notion-ide-validate.yml')

app = APP.read_text(encoding='utf-8')
old_imports = '''import { UI } from "./ui.js";\nimport { LiveLogDurableObject } from "./live-log.js";\nimport { apiImportFiles } from "./file-import.js";\nimport { apiDeleteFiles } from "./file-delete.js";\n\nexport { LiveLogDurableObject };'''
new_imports = '''import { UI } from "./ui.js";\nimport { LiveLogDurableObject } from "./live-log.js";\nimport { apiImportFiles } from "./file-import.js";\nimport { apiDeleteFiles } from "./file-delete.js";\nimport { apiMakeDirectory, apiMovePaths } from "./file-ops.js";\nimport { apiDownload, DownloadError } from "./file-download.js";\nimport { apiSearch } from "./search.js";\nimport { apiHistory, apiRevertCommit } from "./history.js";\nimport { RunQueueDurableObject } from "./run-queue.js";\n\nexport { LiveLogDurableObject, RunQueueDurableObject };'''
if old_imports not in app:
    raise SystemExit('app import marker not found')
app = app.replace(old_imports, new_imports, 1)

old_list = 'return json({ path, items: items.map((item) => ({ name: item.name, path: item.path, type: item.type, sha: item.sha, size: item.size })) });'
new_list = 'return json({ path, items: items.filter((item) => item.name !== ".notion-ide-keep").map((item) => ({ name: item.name, path: item.path, type: item.type, sha: item.sha, size: item.size })) });'
if old_list not in app:
    raise SystemExit('list marker not found')
app = app.replace(old_list, new_list, 1)

old_run = '''  const entrypoint = String(body.entrypoint || "src.train");\n  assertEntrypoint(entrypoint);\n  const requestId = crypto.randomUUID();'''
new_run = '''  const entrypoint = String(body.entrypoint || "src.train");\n  assertEntrypoint(entrypoint);\n  const args = Array.isArray(body.args) ? body.args.map((item) => String(item)) : [];\n  if (args.length > 40 || args.some((item) => item.length > 600) || args.reduce((sum, item) => sum + item.length, 0) > 6000) throw new HttpError(400, "invalid run arguments");\n  const requestId = crypto.randomUUID();'''
if old_run not in app:
    raise SystemExit('run marker not found')
app = app.replace(old_run, new_run, 1)
old_req = 'const runRequest = JSON.stringify({ request_id: requestId, target: "github-hosted", entrypoint, workspace_root: runRoot, requested_at: new Date().toISOString() }, null, 2) + "\\n";'
new_req = 'const runRequest = JSON.stringify({ request_id: requestId, target: "github-hosted", entrypoint, args, workspace_root: runRoot, requested_at: new Date().toISOString() }, null, 2) + "\\n";'
if old_req not in app:
    raise SystemExit('run request marker not found')
app = app.replace(old_req, new_req, 1)

insert_before = 'export default {\n'
helpers = '''function runQueueStub(env) {\n  if (!env.RUN_QUEUE) throw new HttpError(503, "run queue storage is not configured");\n  const id = env.RUN_QUEUE.idFromName(`${env.GITHUB_OWNER}/${env.GITHUB_REPO}:${env.WORKSPACE_BRANCH}`);\n  return env.RUN_QUEUE.get(id);\n}\n\nasync function proxyRunQueue(request, env, path) {\n  const init = { method: request.method, headers: { "content-type": "application/json" } };\n  if (request.method !== "GET") init.body = await request.text();\n  return runQueueStub(env).fetch(`https://run-queue${path}`, init);\n}\n\n'''
if insert_before not in app:
    raise SystemExit('default marker not found')
app = app.replace(insert_before, helpers + insert_before, 1)

old_assets = 'if (url.pathname.startsWith("/fonts/") && request.method === "GET" && env.ASSETS) {'
new_assets = 'if ((url.pathname.startsWith("/fonts/") || url.pathname === "/ide-productivity.js") && request.method === "GET" && env.ASSETS) {'
if old_assets not in app:
    raise SystemExit('asset marker not found')
app = app.replace(old_assets, new_assets, 1)
old_root = 'if (url.pathname === "/" && request.method === "GET") return new Response(UI, { headers: { "content-type": "text/html; charset=utf-8" } });'
new_root = 'if (url.pathname === "/" && request.method === "GET") return new Response(UI.replace("</body>", "<script src=\\"/ide-productivity.js\\"></script></body>"), { headers: { "content-type": "text/html; charset=utf-8" } });'
if old_root not in app:
    raise SystemExit('root marker not found')
app = app.replace(old_root, new_root, 1)

route_marker = '      if (url.pathname === "/api/delete" && request.method === "POST") return await apiDeleteFiles(request, env);\n'
routes = '''      if (url.pathname === "/api/delete" && request.method === "POST") return await apiDeleteFiles(request, env);\n      if (url.pathname === "/api/mkdir" && request.method === "POST") return await apiMakeDirectory(request, env);\n      if (url.pathname === "/api/move" && request.method === "POST") return await apiMovePaths(request, env);\n      if (url.pathname === "/api/download" && request.method === "GET") return await apiDownload(url, env);\n      if (url.pathname === "/api/search" && request.method === "GET") return await apiSearch(url, env);\n      if (url.pathname === "/api/history" && request.method === "GET") return await apiHistory(url, env);\n      if (url.pathname === "/api/revert" && request.method === "POST") return await apiRevertCommit(request, env);\n      if (url.pathname === "/api/queue" && request.method === "GET") return await proxyRunQueue(request, env, "/");\n      if (url.pathname === "/api/queue" && request.method === "POST") return await proxyRunQueue(request, env, "/enqueue");\n      if (url.pathname === "/api/queue/cancel" && request.method === "POST") return await proxyRunQueue(request, env, "/cancel");\n      if (url.pathname === "/api/queue/clear" && request.method === "POST") return await proxyRunQueue(request, env, "/clear");\n'''
if route_marker not in app:
    raise SystemExit('route marker not found')
app = app.replace(route_marker, routes, 1)

old_catch = '      if (error instanceof HttpError) return json({ error: error.message, details: error.details }, error.status);\n'
new_catch = '      if (error instanceof HttpError || error instanceof DownloadError) return json({ error: error.message, details: error.details }, error.status);\n'
if old_catch not in app:
    raise SystemExit('catch marker not found')
app = app.replace(old_catch, new_catch, 1)
APP.write_text(app, encoding='utf-8')

wr = WRANGLER.read_text(encoding='utf-8')
marker = '''[[durable_objects.bindings]]\nname = "LIVE_LOGS"\nclass_name = "LiveLogDurableObject"\n\n[[migrations]]\ntag = "v1-live-logs"\nnew_sqlite_classes = ["LiveLogDurableObject"]\n'''
replacement = marker + '''\n[[durable_objects.bindings]]\nname = "RUN_QUEUE"\nclass_name = "RunQueueDurableObject"\n\n[[migrations]]\ntag = "v2-run-queue"\nnew_sqlite_classes = ["RunQueueDurableObject"]\n'''
if marker not in wr:
    raise SystemExit('wrangler marker not found')
wr = wr.replace(marker, replacement, 1)
WRANGLER.write_text(wr, encoding='utf-8')

val = VALIDATE.read_text(encoding='utf-8')
old_checks = '''          node --check notion-ide/worker/src/index.js\n          node --check notion-ide/worker/src/app.js\n          node --check notion-ide/worker/src/ui.js\n          node --check notion-ide/worker/src/file-import.js\n          node --check notion-ide/worker/src/file-delete.js\n'''
new_checks = old_checks + '''          node --check notion-ide/worker/src/file-ops.js\n          node --check notion-ide/worker/src/file-download.js\n          node --check notion-ide/worker/src/search.js\n          node --check notion-ide/worker/src/history.js\n          node --check notion-ide/worker/src/run-queue.js\n          node --check notion-ide/worker/public/ide-productivity.js\n'''
if old_checks not in val:
    raise SystemExit('validation JS marker not found')
val = val.replace(old_checks, new_checks, 1)
insert = '''      - name: Check Python runner wrapper\n        run: python -m py_compile notion-ide/live_log_exec.py\n\n'''
marker2 = '      - name: Check embedded browser script syntax\n'
if marker2 not in val:
    raise SystemExit('validation browser marker not found')
val = val.replace(marker2, insert + marker2, 1)
VALIDATE.write_text(val, encoding='utf-8')

print('patched app, wrangler, validation')

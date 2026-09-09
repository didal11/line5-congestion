const API_VERSION = "2022-11-28";

class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToText(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function requireApiKey(request, env) {
  if (!env.IDE_KEY) throw new HttpError(500, "IDE_KEY is not configured");
  const key = request.headers.get("x-ide-key") || "";
  if (key !== env.IDE_KEY) throw new HttpError(401, "invalid IDE key");
}

function assertWorkspacePath(path, env) {
  const root = env.WORKSPACE_ROOT.replace(/\/$/, "");
  if (!path || path.includes("..") || path.startsWith("/")) {
    throw new HttpError(400, "invalid path");
  }
  if (path !== root && !path.startsWith(`${root}/`)) {
    throw new HttpError(400, `path must stay under ${root}`);
  }
}

function assertEntrypoint(entrypoint) {
  if (!entrypoint || entrypoint.includes("..")) {
    throw new HttpError(400, "invalid entrypoint");
  }
  if (!/^[A-Za-z0-9_./-]+$/.test(entrypoint)) {
    throw new HttpError(400, "entrypoint contains unsupported characters");
  }
}

async function github(env, path, init = {}) {
  if (!env.GITHUB_TOKEN) throw new HttpError(500, "GITHUB_TOKEN is not configured");
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "x-github-api-version": API_VERSION,
      "user-agent": "line5-notion-ide",
      ...(init.headers || {}),
    },
  });

  const body = await response.text();
  let parsed = null;
  if (body) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body;
    }
  }

  if (!response.ok) {
    throw new HttpError(response.status, `GitHub API ${response.status}`, parsed);
  }
  return parsed;
}

async function githubRaw(env, path) {
  if (!env.GITHUB_TOKEN) throw new HttpError(500, "GITHUB_TOKEN is not configured");
  const response = await fetch(`https://api.github.com${path}`, {
    redirect: "follow",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "x-github-api-version": API_VERSION,
      "user-agent": "line5-notion-ide",
    },
  });
  if (!response.ok) {
    throw new HttpError(response.status, `GitHub API ${response.status}`);
  }
  return response;
}

function repoBase(env) {
  return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
}

async function ensureWorkspaceBranch(env) {
  const base = repoBase(env);
  const branch = env.WORKSPACE_BRANCH;
  try {
    const ref = await github(env, `${base}/git/ref/heads/${encodePath(branch)}`);
    return { branch, sha: ref.object.sha, created: false };
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
  }

  const defaultRef = await github(
    env,
    `${base}/git/ref/heads/${encodePath(env.GITHUB_DEFAULT_BRANCH || "main")}`,
  );
  const created = await github(env, `${base}/git/refs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: defaultRef.object.sha,
    }),
  });
  return { branch, sha: created.object.sha, created: true };
}

async function getContent(env, path, branch = env.WORKSPACE_BRANCH) {
  const query = new URLSearchParams({ ref: branch });
  return github(env, `${repoBase(env)}/contents/${encodePath(path)}?${query}`);
}

async function putContent(env, path, content, message, sha = null) {
  const payload = {
    message,
    content: textToBase64(content),
    branch: env.WORKSPACE_BRANCH,
  };
  if (sha) payload.sha = sha;
  return github(env, `${repoBase(env)}/contents/${encodePath(path)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiBootstrap(env) {
  const branch = await ensureWorkspaceBranch(env);
  return json({
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
    root: env.WORKSPACE_ROOT,
    branch: env.WORKSPACE_BRANCH,
    branch_created: branch.created,
  });
}

async function apiList(url, env) {
  await ensureWorkspaceBranch(env);
  const path = url.searchParams.get("path") || env.WORKSPACE_ROOT;
  assertWorkspacePath(path, env);
  const items = await getContent(env, path);
  if (!Array.isArray(items)) throw new HttpError(400, "path is not a directory");
  return json({
    path,
    items: items.map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type,
      sha: item.sha,
      size: item.size,
    })),
  });
}

async function apiFileGet(url, env) {
  await ensureWorkspaceBranch(env);
  const path = url.searchParams.get("path") || "";
  assertWorkspacePath(path, env);
  const file = await getContent(env, path);
  if (Array.isArray(file) || file.type !== "file") {
    throw new HttpError(400, "path is not a file");
  }
  return json({
    path: file.path,
    sha: file.sha,
    content: base64ToText(file.content || ""),
  });
}

async function apiFilePut(request, env) {
  await ensureWorkspaceBranch(env);
  const body = await request.json();
  const path = String(body.path || "");
  assertWorkspacePath(path, env);
  const content = String(body.content ?? "");
  const sha = body.sha ? String(body.sha) : null;
  const result = await putContent(
    env,
    path,
    content,
    `notion ide: save ${path}`,
    sha,
  );
  return json({
    path,
    sha: result.content.sha,
    commit_sha: result.commit.sha,
  });
}

async function apiRun(request, env) {
  await ensureWorkspaceBranch(env);
  const body = await request.json();
  const entrypoint = String(body.entrypoint || "src.train");
  assertEntrypoint(entrypoint);

  const requestId = crypto.randomUUID();
  const requestPath = "notion-ide/run-request.json";
  let currentSha = null;
  try {
    const current = await getContent(env, requestPath);
    currentSha = current.sha;
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
  }

  const runRequest = JSON.stringify(
    {
      request_id: requestId,
      target: "github-hosted",
      entrypoint,
      workspace_root: env.WORKSPACE_ROOT,
      requested_at: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n";

  const result = await putContent(
    env,
    requestPath,
    runRequest,
    `notion ide: run ${requestId}`,
    currentSha,
  );

  return json({
    request_id: requestId,
    commit_sha: result.commit.sha,
    branch: env.WORKSPACE_BRANCH,
    entrypoint,
  });
}

async function apiRunStatus(url, env) {
  const sha = url.searchParams.get("sha") || "";
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new HttpError(400, "invalid commit sha");

  const params = new URLSearchParams({
    branch: env.WORKSPACE_BRANCH,
    head_sha: sha,
    event: "push",
    per_page: "5",
  });
  const runs = await github(
    env,
    `${repoBase(env)}/actions/workflows/${encodeURIComponent(env.RUN_WORKFLOW)}/runs?${params}`,
  );

  const run = (runs.workflow_runs || [])[0] || null;
  if (!run) return json({ found: false, commit_sha: sha });

  const jobs = await github(env, `${repoBase(env)}/actions/runs/${run.id}/jobs?per_page=100`);
  return json({
    found: true,
    run: {
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      html_url: run.html_url,
      created_at: run.created_at,
      updated_at: run.updated_at,
    },
    jobs: (jobs.jobs || []).map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      started_at: job.started_at,
      completed_at: job.completed_at,
      steps: (job.steps || []).map((step) => ({
        name: step.name,
        status: step.status,
        conclusion: step.conclusion,
        number: step.number,
      })),
    })),
  });
}

async function apiArtifacts(url, env) {
  const runId = url.searchParams.get("run_id") || "";
  if (!/^\d+$/.test(runId)) throw new HttpError(400, "invalid run id");
  const data = await github(env, `${repoBase(env)}/actions/runs/${runId}/artifacts?per_page=100`);
  return json({
    artifacts: (data.artifacts || []).map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      size_in_bytes: artifact.size_in_bytes,
      expired: artifact.expired,
    })),
  });
}

async function apiArtifactDownload(url, env) {
  const artifactId = url.searchParams.get("id") || "";
  if (!/^\d+$/.test(artifactId)) throw new HttpError(400, "invalid artifact id");
  const response = await githubRaw(env, `${repoBase(env)}/actions/artifacts/${artifactId}/zip`);
  return new Response(response.body, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="artifact-${artifactId}.zip"`,
    },
  });
}

async function apiJobLog(url, env) {
  const jobId = url.searchParams.get("job_id") || "";
  if (!/^\d+$/.test(jobId)) throw new HttpError(400, "invalid job id");
  const response = await githubRaw(env, `${repoBase(env)}/actions/jobs/${jobId}/logs`);
  return new Response(response.body, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

const UI = String.raw`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Python Workspace</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;font-size:14px;color:#111;background:#fff}button,input,select,textarea{font:inherit;color:#111;background:#fff;border:1px solid #999;border-radius:0}button{padding:6px 10px;cursor:pointer}button:disabled{cursor:default;color:#888}input,select{padding:6px}textarea{width:100%;min-height:440px;padding:10px;font-family:Consolas,monospace;font-size:13px;line-height:1.45;resize:vertical}header{padding:12px;border-bottom:1px solid #bbb;display:flex;gap:8px;align-items:center}main{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:760px}.left{border-right:1px solid #bbb;padding:10px}.right{padding:10px}.section{border:1px solid #bbb;padding:10px;margin-bottom:10px}.row{display:flex;gap:8px;align-items:center;margin-bottom:8px}.row:last-child{margin-bottom:0}.row input{flex:1}.files{list-style:none;margin:8px 0 0;padding:0}.files li{padding:4px 2px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.files li:hover{text-decoration:underline}.label{display:inline-block;min-width:90px}.status-grid{display:grid;grid-template-columns:120px 1fr;gap:5px}.steps{font-family:Consolas,monospace;font-size:12px;white-space:pre-wrap}.log{min-height:160px;max-height:360px;overflow:auto;border:1px solid #bbb;padding:8px;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px}.muted{color:#666}.error{white-space:pre-wrap;color:#900}@media(max-width:800px){main{grid-template-columns:1fr}.left{border-right:0;border-bottom:1px solid #bbb}}
</style>
</head>
<body>
<header>
<label>Key <input id="key" type="password" autocomplete="current-password"></label>
<button id="connect">Connect</button>
<span id="connection" class="muted">disconnected</span>
</header>
<main>
<aside class="left">
<div class="section">
<div class="row"><button id="up">Up</button><button id="refreshFiles">Refresh</button></div>
<div id="dir" class="muted"></div>
<ul id="files" class="files"></ul>
</div>
</aside>
<section class="right">
<div class="section">
<div class="row"><span class="label">Target</span><select id="target"><option value="github-hosted">GitHub Hosted</option><option disabled>Local PC (later)</option></select></div>
<div class="row"><span class="label">File</span><input id="path"><button id="open">Open</button><button id="newFile">New</button></div>
<textarea id="editor" spellcheck="false"></textarea>
<div class="row"><button id="save">Save</button><span id="saveState" class="muted"></span></div>
</div>
<div class="section">
<div class="row"><span class="label">Entrypoint</span><input id="entrypoint" value="src.train"><button id="run">Run</button></div>
<div class="status-grid"><div>Status</div><div id="runStatus">-</div><div>Run</div><div id="runLink">-</div><div>Commit</div><div id="runSha">-</div></div>
<div id="steps" class="steps"></div>
</div>
<div class="section">
<div class="row"><button id="loadLog" disabled>Load log</button><span id="artifactLinks"></span></div>
<div id="result" class="log"></div>
</div>
<div id="error" class="error"></div>
</section>
</main>
<script>
const $=id=>document.getElementById(id);let config=null,currentSha=null,currentDir="",runCommit=null,runId=null,jobId=null,pollTimer=null;
function apiHeaders(jsonBody=false){const h={"x-ide-key":$("key").value};if(jsonBody)h["content-type"]="application/json";return h}
async function api(path,options={}){options.headers={...apiHeaders(Boolean(options.body)),...(options.headers||{})};const r=await fetch(path,options);const t=await r.text();let data=t;try{data=JSON.parse(t)}catch{}if(!r.ok)throw new Error(typeof data==="string"?data:JSON.stringify(data,null,2));return data}
function showError(e){$("error").textContent=e?String(e.message||e):""}
async function connect(){showError();config=await api("/api/bootstrap",{method:"POST"});sessionStorage.setItem("notionIdeKey",$("key").value);$("connection").textContent=config.owner+"/"+config.repo+" @ "+config.branch;currentDir=config.root;await listDir(currentDir)}
async function listDir(path){const d=await api("/api/list?path="+encodeURIComponent(path));currentDir=d.path;$("dir").textContent=currentDir;const ul=$("files");ul.innerHTML="";d.items.sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==="dir"?-1:1).forEach(item=>{const li=document.createElement("li");li.textContent=(item.type==="dir"?"[DIR] ":"")+item.name;li.onclick=()=>item.type==="dir"?listDir(item.path):openFile(item.path);ul.appendChild(li)})}
async function openFile(path){showError();const f=await api("/api/file?path="+encodeURIComponent(path));$("path").value=f.path;$("editor").value=f.content;currentSha=f.sha;$("saveState").textContent="loaded"}
function newFile(){if(!config)return;const value=$("path").value.trim();if(!value.startsWith(config.root+"/")){ $("path").value=config.root+"/new_file.py" }$("editor").value="";currentSha=null;$("saveState").textContent="new file"}
async function saveFile(){showError();if(!config)throw new Error("connect first");const path=$("path").value.trim();const d=await api("/api/file",{method:"PUT",body:JSON.stringify({path,content:$("editor").value,sha:currentSha})});currentSha=d.sha;$("saveState").textContent="saved "+d.commit_sha.slice(0,8);return d}
async function run(){showError();await saveFile();$("runStatus").textContent="requesting";const d=await api("/api/run",{method:"POST",body:JSON.stringify({entrypoint:$("entrypoint").value.trim()})});runCommit=d.commit_sha;runId=null;jobId=null;$("runSha").textContent=runCommit;$("runLink").textContent="-";$("result").textContent="";$("artifactLinks").textContent="";$("loadLog").disabled=true;if(pollTimer)clearTimeout(pollTimer);await pollRun()}
async function pollRun(){if(!runCommit)return;try{const d=await api("/api/run-status?sha="+encodeURIComponent(runCommit));if(!d.found){$("runStatus").textContent="queued";pollTimer=setTimeout(pollRun,4000);return}runId=d.run.id;$("runStatus").textContent=d.run.status+(d.run.conclusion?" / "+d.run.conclusion:"");$("runLink").innerHTML="<a target='_blank' rel='noreferrer' href='"+d.run.html_url+"'>"+d.run.id+"</a>";jobId=d.jobs[0]?.id||null;$("steps").textContent=d.jobs.flatMap(j=>[j.name+" : "+j.status+(j.conclusion?" / "+j.conclusion:""),...j.steps.map(s=>"  "+s.number+". "+s.name+" : "+s.status+(s.conclusion?" / "+s.conclusion:""))]).join("\n");if(d.run.status!=="completed"){pollTimer=setTimeout(pollRun,4000)}else{$("loadLog").disabled=!jobId;await loadArtifacts()}}catch(e){showError(e);pollTimer=setTimeout(pollRun,7000)}}
async function loadArtifacts(){if(!runId)return;const d=await api("/api/artifacts?run_id="+runId);const box=$("artifactLinks");box.innerHTML="";d.artifacts.forEach(a=>{const link=document.createElement("a");link.href="/api/artifact?id="+a.id+"&key="+encodeURIComponent($("key").value);link.textContent=a.name+" (zip)";link.style.marginRight="10px";link.onclick=async ev=>{ev.preventDefault();try{const r=await fetch("/api/artifact?id="+a.id,{headers:apiHeaders()});if(!r.ok)throw new Error(await r.text());const blob=await r.blob();const u=URL.createObjectURL(blob);const x=document.createElement("a");x.href=u;x.download=a.name+".zip";x.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}catch(e){showError(e)}};box.appendChild(link)})}
async function loadLog(){if(!jobId)return;showError();const r=await fetch("/api/log?job_id="+jobId,{headers:apiHeaders()});const text=await r.text();if(!r.ok)throw new Error(text);$("result").textContent=text}
$("connect").onclick=()=>connect().catch(showError);$("refreshFiles").onclick=()=>listDir(currentDir).catch(showError);$("up").onclick=()=>{if(!config)return;const root=config.root;if(currentDir===root)return;const parent=currentDir.split("/").slice(0,-1).join("/");listDir(parent.startsWith(root)?parent:root).catch(showError)};$("open").onclick=()=>openFile($("path").value.trim()).catch(showError);$("newFile").onclick=newFile;$("save").onclick=()=>saveFile().catch(showError);$("run").onclick=()=>run().catch(showError);$("loadLog").onclick=()=>loadLog().catch(showError);const saved=sessionStorage.getItem("notionIdeKey");if(saved)$("key").value=saved;
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/" && request.method === "GET") {
        return new Response(UI, { headers: { "content-type": "text/html; charset=utf-8" } });
      }

      if (!url.pathname.startsWith("/api/")) {
        return new Response("Not found", { status: 404 });
      }
      requireApiKey(request, env);

      if (url.pathname === "/api/bootstrap" && request.method === "POST") return apiBootstrap(env);
      if (url.pathname === "/api/list" && request.method === "GET") return apiList(url, env);
      if (url.pathname === "/api/file" && request.method === "GET") return apiFileGet(url, env);
      if (url.pathname === "/api/file" && request.method === "PUT") return apiFilePut(request, env);
      if (url.pathname === "/api/run" && request.method === "POST") return apiRun(request, env);
      if (url.pathname === "/api/run-status" && request.method === "GET") return apiRunStatus(url, env);
      if (url.pathname === "/api/artifacts" && request.method === "GET") return apiArtifacts(url, env);
      if (url.pathname === "/api/artifact" && request.method === "GET") return apiArtifactDownload(url, env);
      if (url.pathname === "/api/log" && request.method === "GET") return apiJobLog(url, env);
      return json({ error: "Not found" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message, details: error.details }, error.status);
      }
      return json({ error: String(error?.message || error) }, 500);
    }
  },
};

import { UI } from "./ui.js";
import { LiveLogDurableObject } from "./live-log.js";
import { apiImportFiles } from "./file-import.js";
import { apiDeleteFiles } from "./file-delete.js";
import { apiMakeDirectory, apiMovePaths } from "./file-ops.js";
import { apiDownload, DownloadError } from "./file-download.js";
import { apiSearch } from "./search.js";
import { apiHistory, apiRevertCommit } from "./history.js";
import { RunQueueDurableObject } from "./run-queue.js";

export { LiveLogDurableObject, RunQueueDurableObject };

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
  if ((request.headers.get("x-ide-key") || "") !== env.IDE_KEY) {
    throw new HttpError(401, "invalid IDE key");
  }
}

function assertRepoPath(path, allowRoot = false) {
  if (path.includes("..") || path.startsWith("/") || (!allowRoot && !path)) {
    throw new HttpError(400, "invalid path");
  }
}

function assertEntrypoint(entrypoint) {
  if (!entrypoint || entrypoint.includes("..") || !/^[A-Za-z0-9_./-]+$/.test(entrypoint)) {
    throw new HttpError(400, "invalid entrypoint");
  }
}

function repoBase(env) {
  return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
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
    try { parsed = JSON.parse(body); } catch { parsed = body; }
  }
  if (!response.ok) throw new HttpError(response.status, `GitHub API ${response.status}`, parsed);
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
  if (!response.ok) throw new HttpError(response.status, `GitHub API ${response.status}`);
  return response;
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
  const defaultRef = await github(env, `${base}/git/ref/heads/${encodePath(env.GITHUB_DEFAULT_BRANCH || "main")}`);
  const created = await github(env, `${base}/git/refs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: defaultRef.object.sha }),
  });
  return { branch, sha: created.object.sha, created: true };
}

async function getContent(env, path, branch = env.WORKSPACE_BRANCH) {
  const query = new URLSearchParams({ ref: branch });
  const suffix = path ? `/contents/${encodePath(path)}` : "/contents";
  return github(env, `${repoBase(env)}${suffix}?${query}`);
}

async function putContent(env, path, content, message, sha = null) {
  const payload = { message, content: textToBase64(content), branch: env.WORKSPACE_BRANCH };
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
    root: env.EXPLORER_ROOT || "",
    run_root: env.RUN_ROOT || "",
    branch: env.WORKSPACE_BRANCH,
    branch_created: branch.created,
  });
}

async function apiList(url, env) {
  await ensureWorkspaceBranch(env);
  const path = url.searchParams.has("path") ? String(url.searchParams.get("path")) : String(env.EXPLORER_ROOT || "");
  assertRepoPath(path, true);
  const items = await getContent(env, path);
  if (!Array.isArray(items)) throw new HttpError(400, "path is not a directory");
  return json({ path, items: items.filter((item) => item.name !== ".notion-ide-keep").map((item) => ({ name: item.name, path: item.path, type: item.type, sha: item.sha, size: item.size })) });
}

async function apiFileGet(url, env) {
  await ensureWorkspaceBranch(env);
  const path = url.searchParams.get("path") || "";
  assertRepoPath(path);
  const file = await getContent(env, path);
  if (Array.isArray(file) || file.type !== "file") throw new HttpError(400, "path is not a file");
  return json({ path: file.path, sha: file.sha, content: base64ToText(file.content || "") });
}

async function apiFilePut(request, env) {
  await ensureWorkspaceBranch(env);
  const body = await request.json();
  const path = String(body.path || "");
  assertRepoPath(path);
  const result = await putContent(env, path, String(body.content ?? ""), `notion ide: save ${path}`, body.sha ? String(body.sha) : null);
  return json({ path, sha: result.content.sha, commit_sha: result.commit.sha });
}

async function apiRun(request, env) {
  await ensureWorkspaceBranch(env);
  const body = await request.json();
  const entrypoint = String(body.entrypoint || "src.train");
  assertEntrypoint(entrypoint);
  const args = Array.isArray(body.args) ? body.args.map((item) => String(item)) : [];
  if (args.length > 40 || args.some((item) => item.length > 600) || args.reduce((sum, item) => sum + item.length, 0) > 6000) throw new HttpError(400, "invalid run arguments");
  const requestId = crypto.randomUUID();
  const requestPath = "notion-ide/run-request.json";
  let currentSha = null;
  try { currentSha = (await getContent(env, requestPath)).sha; }
  catch (error) { if (!(error instanceof HttpError) || error.status !== 404) throw error; }
  const runRoot = env.RUN_ROOT || "";
  const runRequest = JSON.stringify({ request_id: requestId, target: "github-hosted", entrypoint, args, workspace_root: runRoot, requested_at: new Date().toISOString() }, null, 2) + "\n";
  const result = await putContent(env, requestPath, runRequest, `notion ide: run ${requestId}`, currentSha);
  return json({ request_id: requestId, commit_sha: result.commit.sha, branch: env.WORKSPACE_BRANCH, entrypoint, run_root: runRoot });
}

async function apiCancel(request, env) {
  await ensureWorkspaceBranch(env);
  const body = await request.json();
  const runId = String(body.run_id || "");
  if (!/^\d+$/.test(runId)) throw new HttpError(400, "invalid run id");
  const requestId = crypto.randomUUID();
  const requestPath = "notion-ide/cancel-request.json";
  let currentSha = null;
  try { currentSha = (await getContent(env, requestPath)).sha; }
  catch (error) { if (!(error instanceof HttpError) || error.status !== 404) throw error; }
  const cancelRequest = JSON.stringify({ request_id: requestId, run_id: Number(runId), requested_at: new Date().toISOString() }, null, 2) + "\n";
  const result = await putContent(env, requestPath, cancelRequest, `notion ide: cancel run ${runId}`, currentSha);
  return json({ request_id: requestId, run_id: Number(runId), commit_sha: result.commit.sha });
}

async function apiRunStatus(url, env) {
  const sha = url.searchParams.get("sha") || "";
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new HttpError(400, "invalid commit sha");
  const params = new URLSearchParams({ branch: env.WORKSPACE_BRANCH, head_sha: sha, event: "push", per_page: "5" });
  const runs = await github(env, `${repoBase(env)}/actions/workflows/${encodeURIComponent(env.RUN_WORKFLOW)}/runs?${params}`);
  const run = (runs.workflow_runs || [])[0] || null;
  if (!run) return json({ found: false, commit_sha: sha });
  const jobs = await github(env, `${repoBase(env)}/actions/runs/${run.id}/jobs?per_page=100`);
  return json({
    found: true,
    run: { id: run.id, status: run.status, conclusion: run.conclusion, html_url: run.html_url, created_at: run.created_at, updated_at: run.updated_at },
    jobs: (jobs.jobs || []).map((job) => ({ id: job.id, name: job.name, status: job.status, conclusion: job.conclusion, started_at: job.started_at, completed_at: job.completed_at, steps: (job.steps || []).map((step) => ({ name: step.name, status: step.status, conclusion: step.conclusion, number: step.number })) })),
  });
}

async function apiArtifacts(url, env) {
  const runId = url.searchParams.get("run_id") || "";
  if (!/^\d+$/.test(runId)) throw new HttpError(400, "invalid run id");
  const data = await github(env, `${repoBase(env)}/actions/runs/${runId}/artifacts?per_page=100`);
  return json({ artifacts: (data.artifacts || []).map((artifact) => ({ id: artifact.id, name: artifact.name, size_in_bytes: artifact.size_in_bytes, expired: artifact.expired })) });
}

async function apiArtifactDownload(url, env) {
  const artifactId = url.searchParams.get("id") || "";
  if (!/^\d+$/.test(artifactId)) throw new HttpError(400, "invalid artifact id");
  const response = await githubRaw(env, `${repoBase(env)}/actions/artifacts/${artifactId}/zip`);
  return new Response(response.body, { status: 200, headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="artifact-${artifactId}.zip"` } });
}

async function apiJobLog(url, env) {
  const jobId = url.searchParams.get("job_id") || "";
  if (!/^\d+$/.test(jobId)) throw new HttpError(400, "invalid job id");
  const response = await githubRaw(env, `${repoBase(env)}/actions/jobs/${jobId}/logs`);
  return new Response(response.body, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function liveLogStub(env, runId) {
  if (!env.LIVE_LOGS) throw new HttpError(503, "live log storage is not configured");
  const id = env.LIVE_LOGS.idFromName(runId);
  return env.LIVE_LOGS.get(id);
}

async function apiLiveLogPost(request, env) {
  const body = await request.json();
  const runId = String(body.run_id || "");
  if (!/^\d+$/.test(runId)) throw new HttpError(400, "invalid run id");
  const text = String(body.text || "");
  if (text.length > 300000) throw new HttpError(413, "live log batch too large");
  const payload = {
    text,
    done: body.done === true,
    exit_code: body.exit_code == null ? null : Number(body.exit_code),
  };
  return liveLogStub(env, runId).fetch("https://live-log/append", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiLiveLogGet(url, env) {
  const runId = String(url.searchParams.get("run_id") || "");
  if (!/^\d+$/.test(runId)) throw new HttpError(400, "invalid run id");
  return liveLogStub(env, runId).fetch("https://live-log/read");
}

function runQueueStub(env) {
  if (!env.RUN_QUEUE) throw new HttpError(503, "run queue storage is not configured");
  const id = env.RUN_QUEUE.idFromName(`${env.GITHUB_OWNER}/${env.GITHUB_REPO}:${env.WORKSPACE_BRANCH}`);
  return env.RUN_QUEUE.get(id);
}

async function proxyRunQueue(request, env, path) {
  const init = { method: request.method, headers: { "content-type": "application/json" } };
  if (request.method !== "GET") init.body = await request.text();
  return runQueueStub(env).fetch(`https://run-queue${path}`, init);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if ((url.pathname.startsWith("/fonts/") || url.pathname === "/ide-productivity.js" || url.pathname === "/notebook-editor.js") && request.method === "GET" && env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      if (url.pathname === "/" && request.method === "GET") return new Response(UI.replace("</body>", "<script src=\"/ide-productivity.js\"></script><script src=\"/notebook-editor.js\"></script></body>"), { headers: { "content-type": "text/html; charset=utf-8" } });
      if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
      requireApiKey(request, env);
      if (url.pathname === "/api/bootstrap" && request.method === "POST") return await apiBootstrap(env);
      if (url.pathname === "/api/list" && request.method === "GET") return await apiList(url, env);
      if (url.pathname === "/api/file" && request.method === "GET") return await apiFileGet(url, env);
      if (url.pathname === "/api/file" && request.method === "PUT") return await apiFilePut(request, env);
      if (url.pathname === "/api/import" && request.method === "POST") return await apiImportFiles(request, env);
      if (url.pathname === "/api/delete" && request.method === "POST") return await apiDeleteFiles(request, env);
      if (url.pathname === "/api/mkdir" && request.method === "POST") return await apiMakeDirectory(request, env);
      if (url.pathname === "/api/move" && request.method === "POST") return await apiMovePaths(request, env);
      if (url.pathname === "/api/download" && request.method === "GET") return await apiDownload(url, env);
      if (url.pathname === "/api/search" && request.method === "GET") return await apiSearch(url, env);
      if (url.pathname === "/api/history" && request.method === "GET") return await apiHistory(url, env);
      if (url.pathname === "/api/revert" && request.method === "POST") return await apiRevertCommit(request, env);
      if (url.pathname === "/api/queue" && request.method === "GET") return await proxyRunQueue(request, env, "/");
      if (url.pathname === "/api/queue" && request.method === "POST") return await proxyRunQueue(request, env, "/enqueue");
      if (url.pathname === "/api/queue/reorder" && request.method === "POST") return await proxyRunQueue(request, env, "/reorder");
      if (url.pathname === "/api/queue/remove" && request.method === "POST") return await proxyRunQueue(request, env, "/remove");
      if (url.pathname === "/api/queue/cancel" && request.method === "POST") return await proxyRunQueue(request, env, "/cancel");
      if (url.pathname === "/api/queue/clear" && request.method === "POST") return await proxyRunQueue(request, env, "/clear");
      if (url.pathname === "/api/run" && request.method === "POST") return await apiRun(request, env);
      if (url.pathname === "/api/cancel" && request.method === "POST") return await apiCancel(request, env);
      if (url.pathname === "/api/run-status" && request.method === "GET") return await apiRunStatus(url, env);
      if (url.pathname === "/api/live-log" && request.method === "POST") return await apiLiveLogPost(request, env);
      if (url.pathname === "/api/live-log" && request.method === "GET") return await apiLiveLogGet(url, env);
      if (url.pathname === "/api/artifacts" && request.method === "GET") return await apiArtifacts(url, env);
      if (url.pathname === "/api/artifact" && request.method === "GET") return await apiArtifactDownload(url, env);
      if (url.pathname === "/api/log" && request.method === "GET") return await apiJobLog(url, env);
      return json({ error: "Not found" }, 404);
    } catch (error) {
      if (error instanceof HttpError || error instanceof DownloadError) return json({ error: error.message, details: error.details }, error.status);
      return json({ error: String(error?.message || error) }, 500);
    }
  },
};

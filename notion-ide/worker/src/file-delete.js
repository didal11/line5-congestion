const API_VERSION = "2022-11-28";
const MAX_PATHS = 200;

class DeleteHttpError extends Error {
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

function repoBase(env) {
  return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
}

async function github(env, path, init = {}) {
  if (!env.GITHUB_TOKEN) throw new DeleteHttpError(500, "GITHUB_TOKEN is not configured");
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
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) throw new DeleteHttpError(response.status, `GitHub API ${response.status}`, body);
  return body;
}

function normalizePath(value) {
  const path = String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const parts = path.split("/");
  if (!path || parts.some((part) => !part || part === "." || part === ".." || /[\r\n]/.test(part))) {
    throw new DeleteHttpError(400, `invalid delete path: ${value}`);
  }
  return parts.join("/");
}

function collapseDescendants(paths) {
  const sorted = [...new Set(paths)].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const kept = [];
  for (const path of sorted) {
    if (kept.some((parent) => path.startsWith(`${parent}/`))) continue;
    kept.push(path);
  }
  return kept;
}

export async function apiDeleteFiles(request, env) {
  try {
    let body;
    try { body = await request.json(); }
    catch { throw new DeleteHttpError(400, "invalid JSON body"); }

    if (!Array.isArray(body.paths) || body.paths.length < 1) {
      throw new DeleteHttpError(400, "paths must be a non-empty array");
    }
    if (body.paths.length > MAX_PATHS) {
      throw new DeleteHttpError(413, `too many selected paths; maximum is ${MAX_PATHS}`);
    }

    const requested = collapseDescendants(body.paths.map(normalizePath));
    const base = repoBase(env);
    const branch = String(env.WORKSPACE_BRANCH || "notion-workspace");
    const branchRef = await github(env, `${base}/git/ref/heads/${encodePath(branch)}`);
    const parentSha = branchRef.object.sha;
    const parentCommit = await github(env, `${base}/git/commits/${parentSha}`);
    const treeData = await github(env, `${base}/git/trees/${parentCommit.tree.sha}?recursive=1`);
    if (treeData.truncated) throw new DeleteHttpError(409, "repository tree is too large to delete safely");

    const byPath = new Map((treeData.tree || []).map((entry) => [entry.path, entry]));
    const missing = requested.filter((path) => !byPath.has(path));
    if (missing.length) return json({ error: "paths no longer exist", missing }, 409);

    const tree = requested.map((path) => {
      const entry = byPath.get(path);
      return { path, mode: entry.mode, type: entry.type, sha: null };
    });

    const newTree = await github(env, `${base}/git/trees`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }),
    });
    const noun = requested.length === 1 ? requested[0] : `${requested.length} items`;
    const commit = await github(env, `${base}/git/commits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: `notion ide: delete ${noun}`, tree: newTree.sha, parents: [parentSha] }),
    });

    try {
      await github(env, `${base}/git/refs/heads/${encodePath(branch)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
    } catch (error) {
      if (error instanceof DeleteHttpError && (error.status === 409 || error.status === 422)) {
        throw new DeleteHttpError(409, "workspace changed during delete; refresh and retry", error.details);
      }
      throw error;
    }

    return json({ ok: true, branch, commit_sha: commit.sha, count: requested.length, paths: requested });
  } catch (error) {
    const status = error instanceof DeleteHttpError ? error.status : 500;
    return json({ error: String(error?.message || error), details: error?.details || null }, status);
  }
}

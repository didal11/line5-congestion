const API_VERSION = "2022-11-28";
const MAX_MOVES = 100;
const KEEP_FILE = ".notion-ide-keep";

class OpsError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function encodePath(path) { return path.split("/").map(encodeURIComponent).join("/"); }
function repoBase(env) { return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`; }
function normalizePath(value) {
  let path = String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
  const parts = path.split("/");
  if (!path || parts.some((p) => !p || p === "." || p === ".." || /[\r\n\0]/.test(p))) throw new OpsError(400, `invalid path: ${value}`);
  return parts.join("/");
}
async function github(env, path, init = {}) {
  if (!env.GITHUB_TOKEN) throw new OpsError(500, "GITHUB_TOKEN is not configured");
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${env.GITHUB_TOKEN}`, "x-github-api-version": API_VERSION, "user-agent": "line5-notion-ide", ...(init.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (!response.ok) throw new OpsError(response.status, `GitHub API ${response.status}`, body);
  return body;
}
async function snapshot(env) {
  const base = repoBase(env), branch = String(env.WORKSPACE_BRANCH || "notion-workspace");
  const ref = await github(env, `${base}/git/ref/heads/${encodePath(branch)}`);
  const headSha = ref.object.sha;
  const commit = await github(env, `${base}/git/commits/${headSha}`);
  const tree = await github(env, `${base}/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw new OpsError(409, "repository tree is too large to modify safely");
  return { base, branch, headSha, treeSha: commit.tree.sha, entries: tree.tree || [] };
}
async function commitTree(env, snap, tree, message) {
  const next = await github(env, `${snap.base}/git/trees`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ base_tree: snap.treeSha, tree }) });
  const commit = await github(env, `${snap.base}/git/commits`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, tree: next.sha, parents: [snap.headSha] }) });
  try {
    await github(env, `${snap.base}/git/refs/heads/${encodePath(snap.branch)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sha: commit.sha, force: false }) });
  } catch (error) {
    if (error instanceof OpsError && (error.status === 409 || error.status === 422)) throw new OpsError(409, "workspace changed during operation; retry", error.details);
    throw error;
  }
  return commit.sha;
}

export async function apiMakeDirectory(request, env) {
  try {
    const body = await request.json();
    const path = normalizePath(body.path);
    const snap = await snapshot(env);
    if (snap.entries.some((e) => e.path === path || e.path.startsWith(`${path}/`))) return json({ error: "path already exists", path }, 409);
    const blob = await github(env, `${snap.base}/git/blobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "", encoding: "utf-8" }) });
    const marker = `${path}/${KEEP_FILE}`;
    const commitSha = await commitTree(env, snap, [{ path: marker, mode: "100644", type: "blob", sha: blob.sha }], `notion ide: new folder ${path}`);
    return json({ ok: true, path, commit_sha: commitSha });
  } catch (error) {
    const status = error instanceof OpsError ? error.status : 500;
    return json({ error: String(error?.message || error), details: error?.details || null }, status);
  }
}

export async function apiMovePaths(request, env) {
  try {
    const body = await request.json();
    const incoming = Array.isArray(body.moves) ? body.moves : [];
    if (!incoming.length) throw new OpsError(400, "moves must be a non-empty array");
    if (incoming.length > MAX_MOVES) throw new OpsError(413, `too many moves; maximum is ${MAX_MOVES}`);
    const moves = incoming.map((m) => ({ from: normalizePath(m?.from), to: normalizePath(m?.to) }));
    const sources = new Set();
    const targets = new Set();
    for (const move of moves) {
      if (move.from === move.to) throw new OpsError(400, `source and target are identical: ${move.from}`);
      if (move.to.startsWith(`${move.from}/`)) throw new OpsError(400, `cannot move a folder into itself: ${move.from}`);
      if (sources.has(move.from)) throw new OpsError(400, `duplicate source: ${move.from}`);
      if (targets.has(move.to)) throw new OpsError(400, `duplicate target: ${move.to}`);
      sources.add(move.from); targets.add(move.to);
    }
    const ordered = [...moves].sort((a, b) => a.from.length - b.from.length);
    for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) if (ordered[j].from.startsWith(`${ordered[i].from}/`)) throw new OpsError(400, `overlapping move sources: ${ordered[i].from}`);

    const snap = await snapshot(env);
    const byPath = new Map(snap.entries.map((e) => [e.path, e]));
    for (const move of moves) if (!byPath.has(move.from)) throw new OpsError(409, `source no longer exists: ${move.from}`);
    for (const move of moves) {
      const conflict = snap.entries.some((e) => (e.path === move.to || e.path.startsWith(`${move.to}/`)) && !sources.has(e.path));
      if (conflict) throw new OpsError(409, `target already exists: ${move.to}`);
    }
    const tree = [];
    for (const move of moves) {
      const entry = byPath.get(move.from);
      tree.push({ path: move.to, mode: entry.mode, type: entry.type, sha: entry.sha });
    }
    for (const move of [...moves].sort((a, b) => b.from.length - a.from.length)) {
      const entry = byPath.get(move.from);
      tree.push({ path: move.from, mode: entry.mode, type: entry.type, sha: null });
    }
    const label = moves.length === 1 ? `${moves[0].from} -> ${moves[0].to}` : `${moves.length} items`;
    const commitSha = await commitTree(env, snap, tree, `notion ide: move ${label}`);
    return json({ ok: true, commit_sha: commitSha, moves });
  } catch (error) {
    const status = error instanceof OpsError ? error.status : 500;
    return json({ error: String(error?.message || error), details: error?.details || null }, status);
  }
}

export { KEEP_FILE, OpsError };

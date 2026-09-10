const API_VERSION = "2022-11-28";
const MAX_FILES = 200;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_BYTES = 60 * 1024 * 1024;
const BLOB_CONCURRENCY = 6;

class ImportHttpError extends Error {
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
  if (!env.GITHUB_TOKEN) throw new ImportHttpError(500, "GITHUB_TOKEN is not configured");
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
  if (!response.ok) throw new ImportHttpError(response.status, `GitHub API ${response.status}`, parsed);
  return parsed;
}

function normalizeRepoPath(value, allowRoot = false) {
  let path = String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/{2,}/g, "/");
  while (path.endsWith("/")) path = path.slice(0, -1);
  if (!path && allowRoot) return "";
  if (!path || path.startsWith("/") || path.includes("\0")) throw new ImportHttpError(400, "invalid path");
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[\r\n]/.test(part))) {
    throw new ImportHttpError(400, "invalid path");
  }
  return parts.join("/");
}

function joinRepoPath(destination, relativePath) {
  const relative = normalizeRepoPath(relativePath, false);
  return destination ? `${destination}/${relative}` : relative;
}

function base64ByteLength(value) {
  if (!value) return 0;
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new ImportHttpError(400, "invalid base64 file content");
  }
  let padding = 0;
  if (value.endsWith("==")) padding = 2;
  else if (value.endsWith("=")) padding = 1;
  return Math.floor(value.length * 3 / 4) - padding;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function apiImportFiles(request, env) {
  try {
    const body = await request.json();
    const destination = normalizeRepoPath(body.destination || "", true);
    const incoming = Array.isArray(body.files) ? body.files : [];
    if (!incoming.length) throw new ImportHttpError(400, "no files supplied");
    if (incoming.length > MAX_FILES) throw new ImportHttpError(413, `too many files; max ${MAX_FILES}`);

    let totalBytes = 0;
    const seen = new Set();
    const files = incoming.map((item) => {
      const relativePath = String(item?.path || item?.name || "");
      const path = joinRepoPath(destination, relativePath);
      if (seen.has(path)) throw new ImportHttpError(400, `duplicate import path: ${path}`);
      seen.add(path);
      const contentBase64 = String(item?.content_base64 ?? "");
      const bytes = base64ByteLength(contentBase64);
      if (bytes > MAX_FILE_BYTES) throw new ImportHttpError(413, `file too large: ${path}`);
      totalBytes += bytes;
      return { path, contentBase64, bytes };
    });
    if (totalBytes > MAX_BATCH_BYTES) throw new ImportHttpError(413, "import batch is too large");

    const base = repoBase(env);
    const branch = String(env.WORKSPACE_BRANCH || "notion-workspace");
    const ref = await github(env, `${base}/git/ref/heads/${encodePath(branch)}`);
    const headSha = ref.object.sha;
    const headCommit = await github(env, `${base}/git/commits/${headSha}`);
    const baseTreeSha = headCommit.tree.sha;
    const treeSnapshot = await github(env, `${base}/git/trees/${baseTreeSha}?recursive=1`);
    if (treeSnapshot.truncated) throw new ImportHttpError(503, "repository tree is too large to check import conflicts safely");

    const existing = new Set((treeSnapshot.tree || []).filter((entry) => entry.type === "blob").map((entry) => entry.path));
    const conflicts = files.filter((file) => existing.has(file.path)).map((file) => file.path);
    if (conflicts.length && body.overwrite !== true) {
      return json({ error: "files already exist", conflicts }, 409);
    }

    const blobs = await mapLimit(files, BLOB_CONCURRENCY, async (file) => {
      const blob = await github(env, `${base}/git/blobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: file.contentBase64, encoding: "base64" }),
      });
      return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    });

    const nextTree = await github(env, `${base}/git/trees`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: blobs }),
    });
    const target = destination || "/";
    const message = `notion ide: import ${files.length} file${files.length === 1 ? "" : "s"} into ${target}`;
    const commit = await github(env, `${base}/git/commits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, tree: nextTree.sha, parents: [headSha] }),
    });

    try {
      await github(env, `${base}/git/refs/heads/${encodePath(branch)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
    } catch (error) {
      if (error instanceof ImportHttpError && (error.status === 409 || error.status === 422)) {
        throw new ImportHttpError(409, "workspace changed during import; retry the upload", error.details);
      }
      throw error;
    }

    return json({
      ok: true,
      branch,
      destination,
      commit_sha: commit.sha,
      count: files.length,
      bytes: totalBytes,
      paths: files.map((file) => file.path),
      overwritten: conflicts,
    });
  } catch (error) {
    const status = error instanceof ImportHttpError ? error.status : 500;
    return json({ error: String(error?.message || error), details: error?.details || null }, status);
  }
}

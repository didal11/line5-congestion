const API_VERSION = "2022-11-28";
const MAX_ZIP_FILES = 200;
const MAX_ZIP_BYTES = 20 * 1024 * 1024;
const KEEP_FILE = ".notion-ide-keep";

class DownloadError extends Error { constructor(status, message, details = null) { super(message); this.status = status; this.details = details; } }
function encodePath(path) { return path.split("/").map(encodeURIComponent).join("/"); }
function repoBase(env) { return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`; }
function normalizePath(value) {
  const path = String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!path || path.split("/").some((p) => !p || p === "." || p === "..")) throw new DownloadError(400, "invalid path");
  return path;
}
async function github(env, path) {
  const r = await fetch(`https://api.github.com${path}`, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${env.GITHUB_TOKEN}`, "x-github-api-version": API_VERSION, "user-agent": "line5-notion-ide" } });
  const text = await r.text(); let body = null; if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (!r.ok) throw new DownloadError(r.status, `GitHub API ${r.status}`, body); return body;
}
function fromBase64(value) { const binary = atob(String(value || "").replace(/\s/g, "")); return Uint8Array.from(binary, (c) => c.charCodeAt(0)); }
function u16(v) { return Uint8Array.of(v & 255, (v >>> 8) & 255); }
function u32(v) { return Uint8Array.of(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); }
function concat(parts) { const n = parts.reduce((s, p) => s + p.length, 0); const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function dosDateTime(date = new Date()) { const year = Math.max(1980, date.getFullYear()); const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1); const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(); return { time, day }; }
function buildZip(files) {
  const enc = new TextEncoder(), locals = [], centrals = []; let offset = 0; const dt = dosDateTime();
  for (const file of files) {
    const name = enc.encode(file.name), data = file.bytes, crc = crc32(data);
    const local = concat([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(dt.time),u16(dt.day),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    locals.push(local);
    const central = concat([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(dt.time),u16(dt.day),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    centrals.push(central); offset += local.length;
  }
  const centralBytes = concat(centrals);
  const end = concat([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralBytes.length),u32(offset),u16(0)]);
  return concat([...locals, centralBytes, end]);
}
function disposition(filename) { return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`; }

export async function apiDownload(url, env) {
  const path = normalizePath(url.searchParams.get("path") || "");
  const base = repoBase(env), branch = String(env.WORKSPACE_BRANCH || "notion-workspace");
  const ref = await github(env, `${base}/git/ref/heads/${encodePath(branch)}`);
  const commit = await github(env, `${base}/git/commits/${ref.object.sha}`);
  const tree = await github(env, `${base}/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw new DownloadError(409, "repository tree is too large to download safely");
  const exact = (tree.tree || []).find((e) => e.path === path);
  if (!exact) throw new DownloadError(404, "path not found");
  const name = path.split("/").pop();
  if (exact.type === "blob") {
    const blob = await github(env, `${base}/git/blobs/${exact.sha}`); const bytes = fromBase64(blob.content);
    return new Response(bytes, { headers: { "content-type": "application/octet-stream", "content-disposition": disposition(name), "cache-control": "no-store" } });
  }
  if (exact.type !== "tree") throw new DownloadError(400, "unsupported path type");
  const prefix = `${path}/`;
  const entries = (tree.tree || []).filter((e) => e.type === "blob" && e.path.startsWith(prefix) && !e.path.endsWith(`/${KEEP_FILE}`));
  if (entries.length > MAX_ZIP_FILES) throw new DownloadError(413, `folder has too many files; maximum is ${MAX_ZIP_FILES}`);
  const estimated = entries.reduce((s, e) => s + Number(e.size || 0), 0);
  if (estimated > MAX_ZIP_BYTES) throw new DownloadError(413, "folder is too large for browser ZIP download (20 MB max)");
  const files = []; let total = 0;
  for (const entry of entries) {
    const blob = await github(env, `${base}/git/blobs/${entry.sha}`), bytes = fromBase64(blob.content); total += bytes.length;
    if (total > MAX_ZIP_BYTES) throw new DownloadError(413, "folder is too large for browser ZIP download (20 MB max)");
    files.push({ name: entry.path.slice(prefix.length), bytes });
  }
  if (!files.length) files.push({ name: `${name}/`, bytes: new Uint8Array() });
  const zip = buildZip(files);
  return new Response(zip, { headers: { "content-type": "application/zip", "content-disposition": disposition(`${name}.zip`), "cache-control": "no-store" } });
}

export { DownloadError };

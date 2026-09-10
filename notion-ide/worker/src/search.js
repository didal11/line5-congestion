const API_VERSION = "2022-11-28";
const TEXT_EXT = /\.(py|md|txt|json|ya?ml|toml|js|jsx|ts|tsx|css|html?|csv|sh|ini|cfg)$/i;
const MAX_SCAN_FILES = 250;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_RESULTS = 100;

class SearchError extends Error { constructor(status, message, details = null) { super(message); this.status = status; this.details = details; } }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }
function encodePath(path) { return path.split("/").map(encodeURIComponent).join("/"); }
function repoBase(env) { return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`; }
async function github(env, path) {
  const r = await fetch(`https://api.github.com${path}`, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${env.GITHUB_TOKEN}`, "x-github-api-version": API_VERSION, "user-agent": "line5-notion-ide" } });
  const text = await r.text(); let body = null; if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (!r.ok) throw new SearchError(r.status, `GitHub API ${r.status}`, body); return body;
}
function decode(content) { const binary = atob(String(content || "").replace(/\s/g, "")); const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0)); return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
async function mapLimit(items, limit, fn) { const out = new Array(items.length); let next = 0; async function worker(){ while(true){ const i=next++; if(i>=items.length)return; out[i]=await fn(items[i],i); } } await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker())); return out; }

export async function apiSearch(url, env) {
  try {
    const q = String(url.searchParams.get("q") || "").trim();
    const mode = String(url.searchParams.get("mode") || "name");
    if (q.length < 1) return json({ mode, query: q, results: [] });
    if (q.length > 200) throw new SearchError(400, "search query is too long");
    if (!new Set(["name","text"]).has(mode)) throw new SearchError(400, "invalid search mode");
    const base = repoBase(env), branch = String(env.WORKSPACE_BRANCH || "notion-workspace");
    const ref = await github(env, `${base}/git/ref/heads/${encodePath(branch)}`);
    const commit = await github(env, `${base}/git/commits/${ref.object.sha}`);
    const tree = await github(env, `${base}/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new SearchError(409, "repository tree is too large to search safely");
    const needle = q.toLowerCase();
    if (mode === "name") {
      const results = (tree.tree || []).filter((e)=>e.path && !e.path.endsWith("/.notion-ide-keep") && e.path.toLowerCase().includes(needle)).slice(0,MAX_RESULTS).map((e)=>({ path:e.path, type:e.type === "tree" ? "dir" : "file" }));
      return json({ mode, query:q, results });
    }
    const candidates = (tree.tree || []).filter((e)=>e.type === "blob" && Number(e.size||0) <= MAX_FILE_BYTES && TEXT_EXT.test(e.path)).slice(0,MAX_SCAN_FILES);
    const groups = await mapLimit(candidates, 8, async (entry) => {
      const blob = await github(env, `${base}/git/blobs/${entry.sha}`), text = decode(blob.content), lines = text.split(/\r?\n/), hits=[];
      for (let i=0;i<lines.length && hits.length<12;i++) { const idx=lines[i].toLowerCase().indexOf(needle); if(idx>=0) hits.push({ path:entry.path, line:i+1, preview:lines[i].trim().slice(0,240) }); }
      return hits;
    });
    const results=[]; for(const hits of groups){ for(const hit of hits){ results.push(hit); if(results.length>=MAX_RESULTS)break; } if(results.length>=MAX_RESULTS)break; }
    return json({ mode, query:q, scanned:candidates.length, results });
  } catch (error) {
    const status = error instanceof SearchError ? error.status : 500;
    return json({ error:String(error?.message||error), details:error?.details||null }, status);
  }
}

export { SearchError };

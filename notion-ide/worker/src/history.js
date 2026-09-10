const API_VERSION = "2022-11-28";
const MAX_HISTORY = 40;

class HistoryError extends Error { constructor(status, message, details = null) { super(message); this.status = status; this.details = details; } }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }
function encodePath(path) { return path.split("/").map(encodeURIComponent).join("/"); }
function repoBase(env) { return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`; }
async function github(env, path, init = {}) {
  const r = await fetch(`https://api.github.com${path}`, { ...init, headers: { accept: "application/vnd.github+json", authorization: `Bearer ${env.GITHUB_TOKEN}`, "x-github-api-version": API_VERSION, "user-agent": "line5-notion-ide", ...(init.headers || {}) } });
  const text = await r.text(); let body = null; if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (!r.ok) throw new HistoryError(r.status, `GitHub API ${r.status}`, body); return body;
}
function blobMap(tree) { return new Map((tree.tree || []).filter((e)=>e.type === "blob").map((e)=>[e.path,e])); }
async function recursiveTree(env, base, sha) { const t = await github(env, `${base}/git/trees/${sha}?recursive=1`); if (t.truncated) throw new HistoryError(409, "repository tree is too large to revert safely"); return t; }
function isVisibleIdeCommit(message) {
  if (!String(message || "").startsWith("notion ide:")) return false;
  return !/^notion ide: (run |cancel run |queue )/i.test(message);
}

export async function apiHistory(url, env) {
  try {
    const limit = Math.min(MAX_HISTORY, Math.max(1, Number(url.searchParams.get("limit") || 25)));
    const branch = String(env.WORKSPACE_BRANCH || "notion-workspace"), base = repoBase(env);
    const commits = await github(env, `${base}/commits?sha=${encodeURIComponent(branch)}&per_page=100`);
    const items = (commits || []).filter((c)=>isVisibleIdeCommit(c.commit?.message || "")).slice(0, limit).map((c)=>({ sha:c.sha, short_sha:c.sha.slice(0,8), message:String(c.commit?.message||"").split("\n")[0], date:c.commit?.committer?.date || c.commit?.author?.date || null }));
    return json({ branch, items });
  } catch (error) {
    const status = error instanceof HistoryError ? error.status : 500;
    return json({ error:String(error?.message||error), details:error?.details||null }, status);
  }
}

export async function apiRevertCommit(request, env) {
  try {
    const body = await request.json(), sha = String(body.commit_sha || "");
    if (!/^[0-9a-f]{40}$/i.test(sha)) throw new HistoryError(400, "invalid commit sha");
    const base = repoBase(env), branch = String(env.WORKSPACE_BRANCH || "notion-workspace");
    const target = await github(env, `${base}/git/commits/${sha}`);
    if (!target.parents?.length) throw new HistoryError(400, "cannot revert a root commit");
    if (!isVisibleIdeCommit(target.message || "")) throw new HistoryError(400, "only user-facing Notion IDE commits can be reverted here");
    const parent = await github(env, `${base}/git/commits/${target.parents[0].sha}`);
    const ref = await github(env, `${base}/git/ref/heads/${encodePath(branch)}`);
    const head = await github(env, `${base}/git/commits/${ref.object.sha}`);
    const [targetTree,parentTree,currentTree] = await Promise.all([recursiveTree(env,base,target.tree.sha),recursiveTree(env,base,parent.tree.sha),recursiveTree(env,base,head.tree.sha)]);
    const t=blobMap(targetTree), p=blobMap(parentTree), c=blobMap(currentTree), changed=[];
    const paths = new Set([...t.keys(), ...p.keys()]);
    for (const path of paths) if ((t.get(path)?.sha || null) !== (p.get(path)?.sha || null)) changed.push(path);
    if (!changed.length) throw new HistoryError(400, "commit has no file changes to revert");
    const conflicts=[];
    for (const path of changed) if ((c.get(path)?.sha || null) !== (t.get(path)?.sha || null)) conflicts.push(path);
    if (conflicts.length) return json({ error:"newer changes conflict with this revert", conflicts }, 409);
    const tree = changed.map((path)=>p.has(path) ? { path, mode:p.get(path).mode, type:"blob", sha:p.get(path).sha } : { path, mode:t.get(path)?.mode || "100644", type:"blob", sha:null });
    const next = await github(env, `${base}/git/trees`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ base_tree:head.tree.sha, tree }) });
    const commit = await github(env, `${base}/git/commits`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ message:`notion ide: revert ${sha.slice(0,8)}`, tree:next.sha, parents:[ref.object.sha] }) });
    try { await github(env, `${base}/git/refs/heads/${encodePath(branch)}`, { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({ sha:commit.sha, force:false }) }); }
    catch(error){ if(error instanceof HistoryError && (error.status===409||error.status===422)) throw new HistoryError(409,"workspace changed during revert; retry",error.details); throw error; }
    return json({ ok:true, commit_sha:commit.sha, reverted_sha:sha, paths:changed });
  } catch (error) {
    const status = error instanceof HistoryError ? error.status : 500;
    return json({ error:String(error?.message||error), details:error?.details||null }, status);
  }
}

export { HistoryError };

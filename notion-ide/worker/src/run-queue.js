const API_VERSION = "2022-11-28";
const MAX_PENDING = 50;
const MAX_ARGS = 40;
const MAX_ARG_LENGTH = 600;
const KEEP_COMPLETED = 20;

function encodePath(path) { return path.split("/").map(encodeURIComponent).join("/"); }
function repoBase(env) { return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`; }
function textToBase64(text) { const bytes = new TextEncoder().encode(text); let binary=""; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary); }
function assertEntrypoint(value) { const v=String(value||""); if(!v || v.includes("..") || !/^[A-Za-z0-9_./-]+$/.test(v)) throw new Error("invalid entrypoint"); return v; }
function normalizeArgs(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_ARGS) throw new Error(`too many arguments; maximum is ${MAX_ARGS}`);
  let total=0; return value.map((v)=>{ const s=String(v); if(s.length>MAX_ARG_LENGTH) throw new Error("run argument is too long"); total+=s.length; if(total>6000) throw new Error("run arguments are too large"); return s; });
}
function publicItem(item) { return { id:item.id, entrypoint:item.entrypoint, args:item.args||[], config_name:item.config_name||"", status:item.status, request_commit_sha:item.request_commit_sha||null, run_id:item.run_id||null, conclusion:item.conclusion||null, created_at:item.created_at, started_at:item.started_at||null, completed_at:item.completed_at||null, cancel_requested:item.cancel_requested===true, error:item.error||null }; }

export class RunQueueDurableObject {
  constructor(ctx, env) { this.ctx=ctx; this.env=env; }
  async load() { return (await this.ctx.storage.get("state")) || { items:[], active_id:null }; }
  async save(state) { await this.ctx.storage.put("state", state); }
  async schedule(delay=200) { await this.ctx.storage.setAlarm(Date.now()+delay); }
  async github(path, init={}) {
    const r=await fetch(`https://api.github.com${path}`, { ...init, headers:{ accept:"application/vnd.github+json", authorization:`Bearer ${this.env.GITHUB_TOKEN}`, "x-github-api-version":API_VERSION, "user-agent":"line5-notion-ide", ...(init.headers||{}) } });
    const text=await r.text(); let body=null; if(text){ try{body=JSON.parse(text)}catch{body=text} }
    if(!r.ok){ const e=new Error(`GitHub API ${r.status}`); e.status=r.status; e.details=body; throw e; } return body;
  }
  async getContent(path) {
    const q=new URLSearchParams({ref:String(this.env.WORKSPACE_BRANCH||"notion-workspace")});
    return this.github(`${repoBase(this.env)}/contents/${encodePath(path)}?${q}`);
  }
  async putContent(path, text, message) {
    let sha=null; try{sha=(await this.getContent(path)).sha}catch(e){if(e.status!==404)throw e}
    const payload={message,content:textToBase64(text),branch:String(this.env.WORKSPACE_BRANCH||"notion-workspace")}; if(sha)payload.sha=sha;
    return this.github(`${repoBase(this.env)}/contents/${encodePath(path)}`, {method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  }
  async createRunRequest(item) {
    const request={ request_id:item.id, target:"github-hosted", entrypoint:item.entrypoint, args:item.args||[], workspace_root:this.env.RUN_ROOT||"", requested_at:new Date().toISOString() };
    const result=await this.putContent("notion-ide/run-request.json",JSON.stringify(request,null,2)+"\n",`notion ide: run ${item.id}`);
    return result.commit.sha;
  }
  async findRun(item) {
    const params=new URLSearchParams({branch:String(this.env.WORKSPACE_BRANCH||"notion-workspace"),head_sha:item.request_commit_sha,event:"push",per_page:"5"});
    const data=await this.github(`${repoBase(this.env)}/actions/workflows/${encodeURIComponent(this.env.RUN_WORKFLOW||"notion-ide-run.yml")}/runs?${params}`);
    return (data.workflow_runs||[])[0]||null;
  }
  async requestCancel(item) {
    if(!item.run_id || item.cancel_commit_sha)return;
    const request={request_id:crypto.randomUUID(),run_id:Number(item.run_id),requested_at:new Date().toISOString()};
    const result=await this.putContent("notion-ide/cancel-request.json",JSON.stringify(request,null,2)+"\n",`notion ide: cancel run ${item.run_id}`);
    item.cancel_commit_sha=result.commit.sha;
  }
  trim(state) {
    const terminal=new Set(["SUCCESS","FAILED","CANCELLED","TIMED_OUT","IDE_ERROR"]), completed=state.items.filter(i=>terminal.has(i.status));
    if(completed.length<=KEEP_COMPLETED)return;
    const remove=new Set(completed.slice(0,completed.length-KEEP_COMPLETED).map(i=>i.id)); state.items=state.items.filter(i=>!remove.has(i.id));
  }
  mapRun(run) {
    if(run.status!=="completed")return String(run.status||"").toUpperCase();
    const c=String(run.conclusion||"failure").toLowerCase(); if(c==="success")return "SUCCESS"; if(c==="cancelled")return "CANCELLED"; if(c==="timed_out")return "TIMED_OUT"; return "FAILED";
  }
  async tick() {
    const state=await this.load();
    let item=state.active_id ? state.items.find(i=>i.id===state.active_id) : null;
    if(!item){ item=state.items.find(i=>i.status==="WAITING"); if(item){ state.active_id=item.id; item.status="REQUESTING"; item.started_at=new Date().toISOString(); item.error=null; item.error_count=0; await this.save(state); } }
    if(!item){ this.trim(state); await this.save(state); return; }
    try {
      if(!item.request_commit_sha){ item.request_commit_sha=await this.createRunRequest(item); item.status="WAITING_FOR_RUN"; await this.save(state); await this.schedule(2500); return; }
      const run=await this.findRun(item);
      if(!run){ item.status=item.cancel_requested?"CANCEL_REQUESTED":"WAITING_FOR_RUN"; await this.save(state); await this.schedule(3000); return; }
      item.run_id=run.id; item.conclusion=run.conclusion||null;
      if(item.cancel_requested && run.status!=="completed"){ await this.requestCancel(item); item.status="CANCEL_REQUESTED"; }
      else item.status=this.mapRun(run);
      if(run.status==="completed"){
        item.completed_at=new Date().toISOString(); state.active_id=null; this.trim(state); await this.save(state);
        if(state.items.some(i=>i.status==="WAITING")) await this.schedule(200); return;
      }
      item.error_count=0; item.error=null; await this.save(state); await this.schedule(3500);
    } catch(error) {
      item.error_count=(item.error_count||0)+1; item.error=String(error?.message||error);
      if(item.error_count>=6){ item.status="IDE_ERROR"; item.completed_at=new Date().toISOString(); state.active_id=null; this.trim(state); await this.save(state); if(state.items.some(i=>i.status==="WAITING"))await this.schedule(500); }
      else { await this.save(state); await this.schedule(8000); }
    }
  }
  async alarm() { await this.tick(); }
  async fetch(request) {
    const url=new URL(request.url), state=await this.load();
    if(request.method==="GET") return Response.json({active_id:state.active_id,items:state.items.map(publicItem)});
    if(url.pathname==="/enqueue" && request.method==="POST"){
      try{
        const body=await request.json(), entrypoint=assertEntrypoint(body.entrypoint), args=normalizeArgs(body.args), pending=state.items.filter(i=>!["SUCCESS","FAILED","CANCELLED","TIMED_OUT","IDE_ERROR"].includes(i.status)).length;
        if(pending>=MAX_PENDING)return Response.json({error:`run queue is full; maximum pending is ${MAX_PENDING}`},{status:409});
        const item={id:crypto.randomUUID(),entrypoint,args,config_name:String(body.config_name||"").slice(0,100),status:"WAITING",created_at:new Date().toISOString(),cancel_requested:false,error_count:0}; state.items.push(item); await this.save(state); await this.schedule(100); return Response.json({ok:true,item:publicItem(item)});
      }catch(error){return Response.json({error:String(error?.message||error)},{status:400})}
    }
    if(url.pathname==="/cancel" && request.method==="POST"){
      const body=await request.json(), item=state.items.find(i=>i.id===String(body.id||"")); if(!item)return Response.json({error:"queue item not found"},{status:404});
      if(["SUCCESS","FAILED","CANCELLED","TIMED_OUT","IDE_ERROR"].includes(item.status))return Response.json({ok:true,item:publicItem(item)});
      if(item.status==="WAITING"){item.status="CANCELLED";item.completed_at=new Date().toISOString()}else{item.cancel_requested=true;item.status="CANCEL_REQUESTED"}
      await this.save(state); await this.schedule(100); return Response.json({ok:true,item:publicItem(item)});
    }
    if(url.pathname==="/clear" && request.method==="POST"){
      state.items=state.items.filter(i=>!["SUCCESS","FAILED","CANCELLED","TIMED_OUT","IDE_ERROR"].includes(i.status)); await this.save(state); return Response.json({ok:true});
    }
    return Response.json({error:"Not found"},{status:404});
  }
}

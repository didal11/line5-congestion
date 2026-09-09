const MAX_TAIL_CHARS = 65536;
const RETENTION_MS = 24 * 60 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export class LiveLogDurableObject {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/append") {
      const body = await request.json();
      const incoming = String(body.text || "");
      const previous = String((await this.state.storage.get("tail")) || "");
      const tail = (previous + incoming).slice(-MAX_TAIL_CHARS);
      const seq = Number((await this.state.storage.get("seq")) || 0) + 1;

      await this.state.storage.put("tail", tail);
      await this.state.storage.put("seq", seq);
      if (body.done === true) {
        await this.state.storage.put("done", true);
        await this.state.storage.put("exit_code", Number(body.exit_code ?? 0));
      }
      await this.state.storage.setAlarm(Date.now() + RETENTION_MS);
      return json({ ok: true, seq, chars: tail.length });
    }

    if (request.method === "GET" && url.pathname === "/read") {
      const tail = String((await this.state.storage.get("tail")) || "");
      const seq = Number((await this.state.storage.get("seq")) || 0);
      const done = Boolean((await this.state.storage.get("done")) || false);
      const exitCode = await this.state.storage.get("exit_code");
      return json({ tail, seq, done, exit_code: exitCode ?? null });
    }

    return json({ error: "Not found" }, 404);
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }
}

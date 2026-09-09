from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time

BATCH_SECONDS = 5.0
MAX_BATCH_BYTES = 256 * 1024


def resolve_command(entrypoint: str) -> list[str]:
    python = sys.executable
    if not entrypoint.endswith(".py"):
        return [python, "-m", entrypoint]

    path = Path(entrypoint)
    if path.parent == Path("."):
        return [python, entrypoint]

    current = Path()
    for part in path.parent.parts:
        current /= part
        if not (current / "__init__.py").is_file():
            return [python, entrypoint]

    module = entrypoint[:-3].replace("/", ".")
    return [python, "-m", module]


def post_live_log(text: str, *, done: bool = False, exit_code: int | None = None) -> None:
    url = os.environ.get("LIVE_LOG_URL", "").strip()
    key = os.environ.get("LIVE_LOG_KEY", "")
    run_id = os.environ.get("LIVE_LOG_RUN_ID", "").strip()
    if not url or not key or not run_id:
        return

    payload = {"run_id": run_id, "text": text, "done": done}
    if exit_code is not None:
        payload["exit_code"] = exit_code
    data = json.dumps(payload).encode("utf-8")

    try:
        result = subprocess.run(
            [
                "curl",
                "--fail",
                "--show-error",
                "--silent",
                "--max-time",
                "10",
                "-H",
                f"x-ide-key: {key}",
                "-H",
                "content-type: application/json",
                "--data-binary",
                "@-",
                url,
            ],
            input=data,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=12,
            check=False,
        )
        if result.returncode != 0:
            message = result.stderr.decode("utf-8", errors="replace").strip()
            print(f"[live-log] upload failed: {message or 'curl failed'}", file=sys.stderr, flush=True)
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"[live-log] upload failed: {exc}", file=sys.stderr, flush=True)


def reader_thread(stream, output_queue: queue.Queue[bytes]) -> None:
    while True:
        chunk = stream.read(4096)
        if not chunk:
            break
        output_queue.put(chunk)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: live_log_exec.py ENTRYPOINT", file=sys.stderr)
        return 2

    entrypoint = sys.argv[1]
    command = resolve_command(entrypoint)
    printable = " ".join(command)
    print(f"+ {printable}", flush=True)

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
        env=env,
    )
    assert process.stdout is not None

    chunks: queue.Queue[bytes] = queue.Queue()
    reader = threading.Thread(target=reader_thread, args=(process.stdout, chunks), daemon=True)
    reader.start()

    pending = bytearray()
    last_flush = time.monotonic()

    while reader.is_alive() or not chunks.empty():
        try:
            chunk = chunks.get(timeout=0.25)
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
            pending.extend(chunk)
        except queue.Empty:
            pass

        now = time.monotonic()
        if pending and (now - last_flush >= BATCH_SECONDS or len(pending) >= MAX_BATCH_BYTES):
            post_live_log(pending.decode("utf-8", errors="replace"))
            pending.clear()
            last_flush = now

    reader.join(timeout=1)
    return_code = process.wait()
    if pending:
        post_live_log(pending.decode("utf-8", errors="replace"))
    post_live_log("", done=True, exit_code=return_code)
    return return_code


if __name__ == "__main__":
    raise SystemExit(main())

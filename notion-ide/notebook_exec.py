from __future__ import annotations

import json
from pathlib import Path
import sys
import traceback


def source_text(cell: dict) -> str:
    source = cell.get("source", "")
    if isinstance(source, list):
        return "".join(str(part) for part in source)
    return str(source or "")


def load_notebook(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SystemExit(f"notebook not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid notebook JSON: {path}: {exc}") from exc

    if not isinstance(data, dict) or not isinstance(data.get("cells"), list):
        raise SystemExit(f"invalid notebook structure: {path}")
    return data


def execute_notebook(path: Path, argv: list[str]) -> int:
    notebook = load_notebook(path)
    namespace = {
        "__name__": "__main__",
        "__file__": str(path),
        "__package__": None,
        "__cached__": None,
    }

    original_argv = sys.argv
    sys.argv = [str(path), *argv]
    executed = 0
    try:
        for cell_index, cell in enumerate(notebook["cells"], start=1):
            if not isinstance(cell, dict) or cell.get("cell_type") != "code":
                continue
            source = source_text(cell)
            if not source.strip():
                continue
            executed += 1
            filename = f"{path}#cell-{cell_index}"
            try:
                code = compile(source, filename, "exec")
                exec(code, namespace, namespace)
            except SystemExit:
                raise
            except BaseException:
                print(f"\n[notebook] error in code cell {cell_index}", file=sys.stderr, flush=True)
                traceback.print_exc()
                return 1
    finally:
        sys.argv = original_argv

    print(f"\n[notebook] completed {executed} code cell(s)", flush=True)
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: notebook_exec.py NOTEBOOK.ipynb [args...]", file=sys.stderr)
        return 2
    return execute_notebook(Path(sys.argv[1]), sys.argv[2:])


if __name__ == "__main__":
    raise SystemExit(main())

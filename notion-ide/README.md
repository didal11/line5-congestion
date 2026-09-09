# Notion GitHub IDE

Minimal browser editor for the repository's Python workspace.

The Cloudflare Worker serves both the editor UI and the gateway API. The browser never receives the GitHub token. Files are read from and saved to the real GitHub repository, on the dedicated `notion-workspace` branch. Pressing Run writes `notion-ide/run-request.json`; that commit triggers the GitHub-hosted runner workflow.

## Runtime layout

```text
Notion embed / browser
        |
        v
Cloudflare Worker
        |
        +--> GitHub Contents API --> notion-workspace branch
        |
        +--> GitHub Actions API --> run status / logs / artifacts
                                  |
                                  v
                         GitHub Hosted Runner
                                  |
                                  v
                         repository root
```

The Worker is internet-hosted, so the same URL can be opened from any computer. No local machine needs to stay online for the GitHub Hosted target.

## Current scope

- browse real files and directories across the repository
- open and edit UTF-8 text files
- create new files from the repository root
- save changes as commits on `notion-workspace`
- run a Python module or relative `.py` path from the repository root using a standard GitHub-hosted Ubuntu runner
- install dependencies from the root `requirements.txt`
- view workflow/job/step state
- load the completed job log
- download `models/**` and `results/**` artifacts
- execution target selector already reserves a disabled `Local PC` option for a later backend

The initial default entrypoint is `src.train`, which runs as `python -m src.train` from the repository root.

## One-time free deployment setup

The code is ready to deploy through `.github/workflows/deploy-notion-ide.yml`. The deployment workflow needs four GitHub Actions repository secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token using the Edit Cloudflare Workers template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `WORKER_GITHUB_TOKEN` | Fine-grained GitHub token restricted to this repository, with Contents read/write and Actions read |
| `NOTION_IDE_KEY` | Password used when opening the embedded editor |

Do not put `WORKER_GITHUB_TOKEN` or Cloudflare credentials in Notion, JavaScript source, repository files, or query parameters.

After the secrets exist, the `Deploy Notion IDE` workflow deploys the Worker. Its output contains the `workers.dev` URL. Put that HTTPS URL in a Notion `/embed` block.

## First connection

1. Open the Worker URL.
2. Enter the value stored as `NOTION_IDE_KEY`.
3. Press `Connect`.
4. The Worker creates `notion-workspace` from `main` if it does not already exist.
5. Select a file such as `src/train.py`, edit, and press `Save`.
6. Set the entrypoint, for example `src.train`, and press `Run`.
7. The page polls GitHub Actions for the exact run created by the Run commit.

## Security boundary

The Worker is scoped to this repository by the fine-grained GitHub token. The GitHub token stays in a Cloudflare Worker secret. The editor password is separate from the GitHub token and is sent only in the `x-ide-key` request header to the same Worker origin.

This is intended as a personal development surface. Keep the Worker URL and IDE key private.

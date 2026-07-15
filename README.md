# Code Sentinel

Code Sentinel accepts a GitHub issue URL and sends it to a small Express API. The API fetches the issue title, body, comments, and the repository's top-level and `src` file tree, then records submitted URLs in a local SQLite database.

## Requirements

- Node.js 22.5 or newer (the backend uses Node's built-in SQLite module)
- npm

## Run locally

Install dependencies from the repository root:

```bash
npm --prefix server install
npm --prefix client install
```

Start the backend in one terminal:

```bash
GITHUB_TOKEN=github_pat_your_token npm run dev:server
```

On PowerShell:

```powershell
$env:GITHUB_TOKEN = "github_pat_your_token"
npm run dev:server
```

Start the frontend in a second terminal:

```bash
npm run dev:client
```

Open the Vite URL shown in the second terminal, normally `http://localhost:5173`.

The API runs on `http://localhost:3001`. During local frontend development, Vite proxies `/analyze` requests to that API. Submitted issue URLs are stored in `server/data/code-sentinel.db`.

## API

`POST /analyze`

```json
{ "issueUrl": "https://github.com/owner/repository/issues/123" }
```

Set `GITHUB_TOKEN` to a GitHub personal access token before starting the backend. A token with read access to the target repository can also access private repositories and receives a higher API rate limit. The backend can fetch public repositories without a token, subject to GitHub's lower unauthenticated rate limit.

When GitHub reports a rate limit, the API responds with HTTP `429` and includes a `retryAfter` value in seconds when GitHub provides one.

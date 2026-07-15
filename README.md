# Code Sentinel

Code Sentinel accepts a GitHub issue URL and sends it to a small Express API. The API currently returns a placeholder analysis response and records submitted URLs in a local SQLite database.

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

For now, the endpoint returns placeholder JSON that includes the submitted URL.

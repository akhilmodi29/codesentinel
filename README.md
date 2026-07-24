# 🛡️ Code Sentinel

> AI-powered GitHub Issue Analyzer that investigates GitHub issues, identifies probable root causes, and generates implementation-ready fixes with proposed code diffs.

Code Sentinel helps developers understand GitHub issues faster by automatically analyzing an issue, exploring the relevant parts of the repository, and generating a structured engineering report using AI.

Instead of manually reading dozens of files, Code Sentinel narrows down the likely cause and suggests how to fix it.

---

## ✨ Features

- 🔗 Analyze any public GitHub Issue using its URL
- 🤖 AI-powered root cause analysis
- 📂 Automatically explores the repository structure
- 📝 Reads issue title, description, and discussion comments
- 🎯 Identifies files most likely responsible
- 💡 Generates implementation steps
- 🔀 Produces a proposed Git-style code diff
- 📋 Returns a PR-style explanation ready for developers
- 📊 Confidence score indicating how likely the proposed solution is
- 💾 Stores previously analyzed issues using SQLite

---

## 🚀 How It Works

```text
GitHub Issue URL
        │
        ▼
Express Backend
        │
        ├── Fetch Issue
        ├── Read Comments
        ├── Explore Repository Tree
        ├── Retrieve Relevant Files
        ▼
 AI Analysis Pipeline
        │
        ├── Root Cause Detection
        ├── File Selection
        ├── Fix Strategy
        ├── Code Diff Generation
        ├── Confidence Estimation
        ▼
 Structured Engineering Report
```

---

## 🛠 Tech Stack

### Frontend

- React
- Vite
- CSS3

### Backend

- Node.js
- Express
- SQLite (Node built-in)
- GitHub REST API
- AI Model API

---

## 📦 Project Structure

```text
CodeSentinel/
│
├── client/          # React frontend
├── server/          # Express backend
│   ├── data/
│   ├── routes/
│   ├── services/
│   └── utils/
│
├── README.md
└── package.json
```

---

# ⚙️ Requirements

- Node.js **22.5+**
- npm
- GitHub Personal Access Token *(recommended)*
- AI API Key

---

# 🚀 Getting Started

## 1. Clone the repository

```bash
git clone https://github.com/akhilmodi29/code-sentinel.git

cd code-sentinel
```

---

## 2. Install dependencies

```bash
npm --prefix server install
npm --prefix client install
```

---

## 3. Configure Environment Variables

### macOS / Linux

```bash
export GITHUB_TOKEN=github_pat_xxxxxxxxx
export AI_API_KEY=your_api_key
export AI_MODEL=your_model_name
```

### Windows PowerShell

```powershell
$env:GITHUB_TOKEN="github_pat_xxxxxxxxx"
$env:AI_API_KEY="your_api_key"
$env:AI_MODEL="your_model_name"
```

> **Note:**  
> If your chosen AI provider exposes an OpenAI-compatible API, you may keep the existing environment variable names used by the application.

---

## 4. Start the Backend

```bash
npm run dev:server
```

Runs on:

```
http://localhost:3001
```

---

## 5. Start the Frontend

```bash
npm run dev:client
```

Open:

```
http://localhost:5173
```

During development, Vite automatically proxies `/analyze` requests to the backend.

---

# 📡 API

## Analyze GitHub Issue

**POST**

```
/analyze
```

### Request

```json
{
  "issueUrl": "https://github.com/owner/repository/issues/123"
}
```

---

### Example Response

```json
{
  "confidence": 91,
  "rootCause": "...",
  "files": [
    "src/App.jsx",
    "src/components/Navbar.jsx"
  ],
  "implementationSteps": [],
  "diff": "...",
  "summary": "..."
}
```

---

# 🧠 Analysis Pipeline

For every submitted GitHub issue, Code Sentinel:

1. Fetches the issue title and description.
2. Retrieves issue discussion comments.
3. Builds the repository file tree.
4. Identifies the most relevant source files.
5. Retrieves file contents for analysis.
6. Uses an AI model to:
   - determine the most likely root cause
   - estimate confidence
   - generate implementation steps
   - produce a proposed code diff
   - write a PR-style explanation
7. Returns a structured engineering report.
8. Stores the analyzed issue locally using SQLite.

---

# 💾 Local Database

Submitted issue URLs are automatically stored in:

```
server/data/code-sentinel.db
```

This prevents duplicate processing and maintains a local analysis history.

---

# 🔑 GitHub Token

A GitHub Personal Access Token is optional for public repositories but strongly recommended.

Benefits include:

- Higher GitHub API rate limits
- Access to private repositories (with appropriate permissions)
- Faster and more reliable repository traversal

Without a token, Code Sentinel falls back to GitHub's public API rate limits.

---

# ⚠️ Rate Limiting

If GitHub's API rate limit is exceeded, the backend returns:

```
HTTP 429
```

along with a `retryAfter` value (when provided by GitHub).

---

# 🎯 Future Improvements

- 🔍 Repository-wide semantic search
- 🧠 Multi-file dependency analysis
- 🤖 Automatic Pull Request generation
- 🔄 One-click GitHub Pull Request creation
- ⚡ Streaming AI responses
- 🌙 Dark mode
- 🦊 GitLab support
- 🪣 Bitbucket support
- 📚 Repository indexing for faster repeated analysis
- 💬 Inline fix explanations
- 📈 Historical issue analytics

---

# 🤝 Contributing

Contributions are welcome!

Feel free to open an issue or submit a pull request to improve Code Sentinel.

---

## ⭐ If you found this project useful, consider giving it a star!

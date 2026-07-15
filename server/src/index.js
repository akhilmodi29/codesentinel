import cors from 'cors';
import express from 'express';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchIssueAnalysis, GitHubApiError, parseGitHubIssueUrl } from './github.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(__dirname, '..', 'data');
mkdirSync(dataDirectory, { recursive: true });
const databasePath = path.join(dataDirectory, 'code-sentinel.db');
const db = new DatabaseSync(databasePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/analyze', async (req, res) => {
  const { issueUrl } = req.body ?? {};

  if (typeof issueUrl !== 'string' || issueUrl.trim() === '') {
    return res.status(400).json({ error: 'issueUrl is required.' });
  }

  try {
    const issueReference = parseGitHubIssueUrl(issueUrl.trim());
    const analysis = await fetchIssueAnalysis(issueReference);
    db.prepare('INSERT INTO analyses (issue_url) VALUES (?)').run(issueUrl.trim());
    return res.json(analysis);
  } catch (error) {
    if (error instanceof GitHubApiError) {
      const response = { error: error.message };
      if (error.retryAfter !== undefined) {
        response.retryAfter = error.retryAfter;
      }
      return res.status(error.status ?? 502).json(response);
    }

    console.error('Unexpected analysis error:', error);
    return res.status(500).json({ error: 'Unable to analyze this issue.' });
  }
});

app.listen(port, () => {
  console.log(`Code Sentinel API listening on http://localhost:${port}`);
});

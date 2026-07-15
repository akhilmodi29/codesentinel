import cors from 'cors';
import express from 'express';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

app.post('/analyze', (req, res) => {
  const { issueUrl } = req.body ?? {};

  if (typeof issueUrl !== 'string' || issueUrl.trim() === '') {
    return res.status(400).json({ error: 'issueUrl is required.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(issueUrl);
  } catch {
    return res.status(400).json({ error: 'Provide a valid GitHub issue URL.' });
  }

  if (parsedUrl.hostname !== 'github.com') {
    return res.status(400).json({ error: 'Provide a GitHub issue URL.' });
  }

  const cleanUrl = parsedUrl.toString();
  db.prepare('INSERT INTO analyses (issue_url) VALUES (?)').run(cleanUrl);

  return res.json({
    status: 'placeholder',
    issueUrl: cleanUrl,
    message: 'Issue analysis will be available here soon.'
  });
});

app.listen(port, () => {
  console.log(`Code Sentinel API listening on http://localhost:${port}`);
});

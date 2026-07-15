import { useState } from 'react';

export default function App() {
  const [issueUrl, setIssueUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setResult(null);
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:3001/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueUrl })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Analysis request failed.');
      }

      setResult(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="workspace" aria-labelledby="app-title">
        <header>
          <p className="eyebrow">Issue intelligence</p>
          <h1 id="app-title">Code Sentinel</h1>
          <p className="subtitle">Analyze a GitHub issue and inspect the response.</p>
        </header>

        <form onSubmit={handleSubmit} className="analysis-form">
          <label htmlFor="issue-url">GitHub issue URL</label>
          <div className="input-row">
            <input
              id="issue-url"
              type="url"
              value={issueUrl}
              onChange={(event) => setIssueUrl(event.target.value)}
              placeholder="https://github.com/owner/repository/issues/123"
              required
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Analyzing...' : 'Analyze issue'}
            </button>
          </div>
        </form>

        <section className="results" aria-live="polite" aria-labelledby="results-title">
          <div className="results-heading">
            <h2 id="results-title">Results</h2>
            {result && <span>Response received</span>}
          </div>
          {error && <p className="error">{error}</p>}
          {result ? (
            <pre>{JSON.stringify(result, null, 2)}</pre>
          ) : !error && (
            <p className="empty-state">Submit an issue URL to see the API response.</p>
          )}
        </section>
      </section>
    </main>
  );
}

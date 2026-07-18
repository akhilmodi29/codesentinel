import { useState } from 'react';

function DiffView({ diff }) {
  if (!diff) {
    return <p className="empty-state">No patch is proposed because the available evidence is insufficient.</p>;
  }

  return (
    <pre className="diff" aria-label="Proposed code diff">
      {diff.split('\n').map((line, index) => {
        const className = line.startsWith('+')
          ? 'diff-addition'
          : line.startsWith('-')
            ? 'diff-removal'
            : line.startsWith('@@') || line.startsWith('diff --git')
              ? 'diff-meta'
              : '';
        return <code className={className} key={`${index}-${line}`}>{line}{'\n'}</code>;
      })}
    </pre>
  );
}

const sampleResult = {
  agent: {
    confidence: 78,
    steps: [{ number: 1, title: "Root-cause hypothesis", output: { hypothesis: "Sample hypothesis text.", reasoning: ["Evidence A", "Evidence B"] } }],
    relevantFiles: [{ path: "src/example.js", reason: "Contains the relevant logic." }],
    diff: "@@ -1,2 +1,2 @@\n-old line\n+new line",
    explanation: "Sample fix explanation."
  }
};

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

  const agent = result?.agent ?? null;
  const confidence = typeof agent?.confidence === 'number' ? agent.confidence : null;
  const steps = Array.isArray(agent?.steps) ? agent.steps : [];
  const relevantFiles = Array.isArray(agent?.relevantFiles) ? agent.relevantFiles : [];
  const diff = agent?.diff ?? '';

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
            <button type="button" onClick={() => setResult(sampleResult)}>
              Try demo example
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
            <div className="analysis-result">
              {agent ? (
                <>
                  <div className="confidence-row">
                    <div>
                      <p className="section-label">Confidence</p>
                      <strong>{confidence !== null ? `${Math.round(confidence)}%` : 'N/A'}</strong>
                    </div>
                    <div className="confidence-track" aria-label={`Confidence: ${confidence !== null ? Math.round(confidence) : 0} percent`}>
                      <span style={{ width: `${confidence !== null ? confidence : 0}%` }} />
                    </div>
                  </div>

                  <section className="result-section">
                    <h3>Reasoning steps</h3>
                    {steps.length > 0 ? (
                      <ol className="steps-list">
                        {steps.map((step) => (
                          <li key={step.number}>
                            <strong>{step.title}</strong>
                            {step.output?.hypothesis && <p>{step.output.hypothesis}</p>}
                            {step.output?.reasoning && <ul>{step.output.reasoning.map((item) => <li key={item}>{item}</li>)}</ul>}
                            {step.output?.explanation && <p>{step.output.explanation}</p>}
                            {step.output?.risks?.length > 0 && <p className="risks">Risks: {step.output.risks.join(' ')}</p>}
                          </li>
                        ))}
                      </ol>
                    ) : <p className="empty-state">No reasoning steps were returned.</p>}
                  </section>

                  <section className="result-section">
                    <h3>Relevant files</h3>
                    {relevantFiles.length > 0 ? (
                      <ul className="files-list">
                        {relevantFiles.map((file) => <li key={file.path}><code>{file.path}</code><span>{file.reason}</span></li>)}
                      </ul>
                    ) : <p className="empty-state">No supported file candidates were identified.</p>}
                  </section>

                  <section className="result-section">
                    <h3>Proposed patch</h3>
                    <DiffView diff={diff} />
                  </section>
                </>
              ) : (
                <p className="empty-state">The analysis response did not include agent details. Please try again.</p>
              )}
            </div>
          ) : !error && (
            <p className="empty-state">{isLoading ? 'Fetching issue context and preparing an analysis...' : 'Submit an issue URL to see the API response.'}</p>
          )}
        </section>
      </section>
    </main>
  );
}

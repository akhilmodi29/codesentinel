import { fetchRawFileContent } from '../github.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.3-70b-versatile has a 12,000 TPM free-tier limit (the 8b model is only 6,000 TPM).
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const MAX_RELEVANT_FILES = 3;
// Keep file excerpts tight so the patch step stays comfortably under 12k TPM.
const MAX_FILE_CHARS = 2_000;

export class AgentPipelineError extends Error {
  constructor(message, { status = 502 } = {}) {
    super(message);
    this.name = 'AgentPipelineError';
    this.status = status;
  }
}

function logStep(step) {
  console.log(`[analysis pipeline] ${step.number}. ${step.title}`, step.output);
}

/**
 * Call the Groq chat completions endpoint with JSON mode enabled.
 * The schema is embedded into the system prompt so the model knows
 * exactly what structure to produce.
 */
async function requestStructuredOutput({ schema, systemPrompt, userPrompt }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AgentPipelineError('GROQ_API_KEY is required to run the analysis pipeline.', {
      status: 503
    });
  }

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  let response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `${systemPrompt}\n\nRespond ONLY with a valid JSON object matching this schema:\n${JSON.stringify(schema, null, 2)}`
          },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });
  } catch {
    throw new AgentPipelineError('Unable to reach the Groq API. Please try again.', { status: 502 });
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const message = detail.error?.message || 'Groq analysis request failed.';
    const isRateLimited = response.status === 429 || /rate.?limit|quota/i.test(message);
    throw new AgentPipelineError(message, {
      status: isRateLimited ? 429 : response.status === 401 ? 503 : 502
    });
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new AgentPipelineError('Groq returned an empty analysis response.');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new AgentPipelineError('Groq returned an invalid JSON response.');
  }
}

function issueContext(analysis) {
  return {
    issue: {
      number: analysis.issue.number,
      title: analysis.issue.title,
      body: analysis.issue.body?.slice(0, 2_000) ?? '',
      comments: analysis.issue.comments.slice(0, 5).map((comment) => ({
        author: comment.author,
        body: comment.body?.slice(0, 500) ?? ''
      }))
    },
    repository: {
      owner: analysis.repository.owner,
      name: analysis.repository.name,
      defaultBranch: analysis.repository.defaultBranch,
      // Flat array of up to 300 source file paths, shallower paths first.
      // Plain strings are far more token-efficient than objects with metadata.
      filePaths: analysis.repository.fileTree.paths
    }
  };
}

const hypothesisSchema = {
  type: 'object',
  required: ['hypothesis', 'reasoning', 'relevantFiles', 'confidence'],
  properties: {
    hypothesis: { type: 'string' },
    reasoning: { type: 'array', items: { type: 'string' } },
    relevantFiles: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'reason'],
        properties: {
          path: { type: 'string' },
          reason: { type: 'string' }
        }
      }
    },
    confidence: { type: 'number', minimum: 0, maximum: 100 }
  }
};

const patchSchema = {
  type: 'object',
  required: ['diff', 'explanation', 'confidence', 'risks'],
  properties: {
    diff: { type: 'string' },
    explanation: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
    risks: { type: 'array', items: { type: 'string' } }
  }
};

export async function runAnalysisPipeline(analysis) {
  const context = issueContext(analysis);
  const steps = [];

  // Step 1 — form a root-cause hypothesis and identify relevant files
  const hypothesis = await requestStructuredOutput({
    schema: hypothesisSchema,
    systemPrompt: `You are a senior software engineer investigating a GitHub issue. Based only on the issue and file tree provided, form a cautious root-cause hypothesis and identify up to ${MAX_RELEVANT_FILES} existing blob file paths that should be inspected. Do not invent file paths — only reference paths that appear in the file tree. Clearly distinguish evidence from inference.`,
    userPrompt: JSON.stringify(context)
  });
  const hypothesisStep = {
    number: 1,
    title: 'Root-cause hypothesis',
    output: {
      hypothesis: hypothesis.hypothesis,
      reasoning: hypothesis.reasoning,
      confidence: hypothesis.confidence
    }
  };
  steps.push(hypothesisStep);
  logStep(hypothesisStep);

  // Step 2 — filter hypothesis files against the actual file tree
  const availableFiles = new Set(analysis.repository.fileTree.paths);
  const relevantFiles = (hypothesis.relevantFiles ?? [])
    .filter((file) => availableFiles.has(file.path))
    .slice(0, MAX_RELEVANT_FILES);
  const fileSelectionStep = {
    number: 2,
    title: 'Relevant files identified',
    output: { files: relevantFiles }
  };
  steps.push(fileSelectionStep);
  logStep(fileSelectionStep);

  // Step 3 — fetch the content of each relevant file
  const fetchedFiles = await Promise.all(
    relevantFiles.map(async (file) => {
      const content = await fetchRawFileContent({
        owner: analysis.repository.owner,
        repo: analysis.repository.name,
        path: file.path,
        ref: analysis.repository.defaultBranch
      });
      return {
        path: file.path,
        reason: file.reason,
        content: content.slice(0, MAX_FILE_CHARS),
        truncated: content.length > MAX_FILE_CHARS
      };
    })
  );
  const fileFetchStep = {
    number: 3,
    title: 'Relevant file contents fetched',
    output: {
      files: fetchedFiles.map(({ path, reason, content, truncated }) => ({
        path,
        reason,
        content,
        truncated
      }))
    }
  };
  steps.push(fileFetchStep);
  logStep({
    ...fileFetchStep,
    output: { files: fetchedFiles.map(({ path, truncated }) => ({ path, truncated })) }
  });

  // Step 4 & 5 — propose a patch.
  // Send a compact payload to stay well within the 12k TPM free-tier limit:
  // only the issue title, a short body snippet, the hypothesis text, and
  // stripped file contents (path + content only — no tree, no comments).
  const compactIssue = {
    title: analysis.issue.title,
    body: analysis.issue.body?.slice(0, 600) ?? ''
  };
  const compactHypothesis = {
    hypothesis: hypothesis.hypothesis,
    reasoning: hypothesis.reasoning
  };
  const compactFiles = fetchedFiles.map(({ path, content }) => ({ path, content }));

  const proposedFix = await requestStructuredOutput({
    schema: patchSchema,
    systemPrompt: `You are preparing a focused code fix for a GitHub issue. Use the issue summary, hypothesis, and file excerpts provided. Return a unified diff only for changes supported by the evidence. If the evidence is insufficient, return an empty string for diff and explain why. Write the explanation as concise PR body prose covering the behavior fixed and any risks.`,
    userPrompt: `Issue:\n${JSON.stringify(compactIssue)}\n\nHypothesis:\n${JSON.stringify(compactHypothesis)}\n\nFile excerpts:\n${JSON.stringify(compactFiles)}`
  });
  const patchStep = {
    number: 4,
    title: 'Proposed patch',
    output: { diff: proposedFix.diff, confidence: proposedFix.confidence }
  };
  steps.push(patchStep);
  logStep(patchStep);

  const explanationStep = {
    number: 5,
    title: 'PR-style fix explanation',
    output: { explanation: proposedFix.explanation, risks: proposedFix.risks }
  };
  steps.push(explanationStep);
  logStep(explanationStep);

  return {
    confidence: proposedFix.confidence,
    hypothesis: hypothesis.hypothesis,
    relevantFiles,
    diff: proposedFix.diff,
    explanation: proposedFix.explanation,
    risks: proposedFix.risks,
    steps
  };
}

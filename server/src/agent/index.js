import { fetchRawFileContent } from '../github.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_RELEVANT_FILES = 6;
const MAX_FILE_CHARS = 24_000;

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

function outputText(response) {
  if (response.output_text) {
    return response.output_text;
  }

  return response.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === 'output_text')?.text;
}

async function requestStructuredOutput({ name, schema, prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AgentPipelineError('OPENAI_API_KEY is required to run the analysis pipeline.', {
      status: 503
    });
  }

  let response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name,
            strict: true,
            schema
          }
        }
      })
    });
  } catch {
    throw new AgentPipelineError('Unable to reach the OpenAI API. Please try again.', { status: 502 });
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new AgentPipelineError(detail.error?.message || 'OpenAI analysis request failed.', {
      status: response.status === 401 ? 503 : 502
    });
  }

  const data = await response.json();
  try {
    return JSON.parse(outputText(data));
  } catch {
    throw new AgentPipelineError('OpenAI returned an invalid analysis response.');
  }
}

function issueContext(analysis) {
  return {
    issue: {
      number: analysis.issue.number,
      title: analysis.issue.title,
      body: analysis.issue.body?.slice(0, 12_000) ?? '',
      comments: analysis.issue.comments.slice(0, 20).map((comment) => ({
        author: comment.author,
        body: comment.body?.slice(0, 4_000) ?? ''
      }))
    },
    repository: {
      owner: analysis.repository.owner,
      name: analysis.repository.name,
      defaultBranch: analysis.repository.defaultBranch,
      fileTree: {
        topLevel: analysis.repository.fileTree.topLevel,
        src: analysis.repository.fileTree.src.slice(0, 400)
      }
    }
  };
}

const hypothesisSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['hypothesis', 'reasoning', 'relevantFiles', 'confidence'],
  properties: {
    hypothesis: { type: 'string' },
    reasoning: { type: 'array', items: { type: 'string' } },
    relevantFiles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
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
  additionalProperties: false,
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

  const hypothesis = await requestStructuredOutput({
    name: 'issue_hypothesis',
    schema: hypothesisSchema,
    prompt: `You are a senior software engineer investigating a GitHub issue. Based only on the issue and file tree below, form a cautious root-cause hypothesis and identify up to ${MAX_RELEVANT_FILES} existing blob file paths that should be inspected. Do not invent files. Clearly distinguish evidence from inference.\n\n${JSON.stringify(context)}`
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

  const treeEntries = [...analysis.repository.fileTree.topLevel, ...analysis.repository.fileTree.src];
  const availableFiles = new Map(
    treeEntries.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry])
  );
  const relevantFiles = hypothesis.relevantFiles
    .filter((file) => availableFiles.has(file.path))
    .slice(0, MAX_RELEVANT_FILES);
  const fileSelectionStep = {
    number: 2,
    title: 'Relevant files identified',
    output: { files: relevantFiles }
  };
  steps.push(fileSelectionStep);
  logStep(fileSelectionStep);

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

  const proposedFix = await requestStructuredOutput({
    name: 'issue_patch',
    schema: patchSchema,
    prompt: `You are preparing a focused code fix for a GitHub issue. Use the issue context, hypothesis, and supplied file contents. Return a unified diff only for changes supported by the evidence. If the evidence is insufficient, return an empty diff and state that in the explanation. Write the explanation as concise PR body prose, including the behavior fixed and any risks.\n\nIssue context:\n${JSON.stringify(context)}\n\nHypothesis:\n${JSON.stringify(hypothesis)}\n\nFetched files:\n${JSON.stringify(fetchedFiles)}`
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

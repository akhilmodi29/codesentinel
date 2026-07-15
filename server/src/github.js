const API_BASE_URL = 'https://api.github.com';
const API_VERSION = '2022-11-28';

export class GitHubApiError extends Error {
  constructor(message, { status, retryAfter } = {}) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function parseGitHubIssueUrl(issueUrl) {
  let url;
  try {
    url = new URL(issueUrl);
  } catch {
    throw new GitHubApiError('Provide a valid GitHub issue URL.', { status: 400 });
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const [owner, repo, resource, issueNumber, ...extra] = segments;

  if (
    url.hostname !== 'github.com' ||
    !owner ||
    !repo ||
    resource !== 'issues' ||
    !/^\d+$/.test(issueNumber ?? '') ||
    extra.length > 0
  ) {
    throw new GitHubApiError(
      'Provide a GitHub issue URL in the form https://github.com/owner/repository/issues/123.',
      { status: 400 }
    );
  }

  return { owner, repo, issueNumber: Number(issueNumber) };
}

function getRetryAfter(response) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Number(retryAfter);
  }

  const resetAt = response.headers.get('x-ratelimit-reset');
  if (resetAt && /^\d+$/.test(resetAt)) {
    return Math.max(0, Number(resetAt) - Math.floor(Date.now() / 1000));
  }

  return undefined;
}

async function githubRequest(path, { accept = 'application/vnd.github+json' } = {}) {
  const headers = {
    Accept: accept,
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'code-sentinel'
  };
  const token = process.env.GITHUB_TOKEN;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers });
  } catch {
    throw new GitHubApiError('Unable to reach the GitHub API. Please try again.', { status: 502 });
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const isRateLimited =
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail.message)));

    if (isRateLimited) {
      throw new GitHubApiError('GitHub API rate limit reached. Please try again later.', {
        status: 429,
        retryAfter: getRetryAfter(response)
      });
    }

    throw new GitHubApiError(detail.message || 'GitHub API request failed.', { status: response.status });
  }

  return response;
}

async function getJson(path) {
  const response = await githubRequest(path);
  return response.json();
}

async function getAllPages(path) {
  const items = [];
  let nextPath = path;

  while (nextPath) {
    const response = await githubRequest(nextPath);
    items.push(...(await response.json()));
    const nextLink = response.headers
      .get('link')
      ?.split(',')
      .find((link) => link.includes('rel="next"'));
    nextPath = nextLink?.match(/<https:\/\/api\.github\.com([^>]+)>/)?.[1];
  }

  return items;
}

function toTreeEntry(entry) {
  return {
    path: entry.path,
    type: entry.type,
    sha: entry.sha,
    size: entry.size
  };
}

export async function fetchRawFileContent({ owner, repo, path, ref }) {
  if (!path || path.startsWith('/') || path.includes('..')) {
    throw new GitHubApiError('Provide a repository-relative file path.', { status: 400 });
  }

  const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const response = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}${query}`,
    { accept: 'application/vnd.github.raw+json' }
  );
  return response.text();
}

export async function fetchIssueAnalysis({ owner, repo, issueNumber }) {
  const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const issuePath = `${repositoryPath}/issues/${issueNumber}`;

  const [issue, comments, repository] = await Promise.all([
    getJson(issuePath),
    getAllPages(`${issuePath}/comments?per_page=100`),
    getJson(repositoryPath)
  ]);
  const tree = await getJson(
    `${repositoryPath}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`
  );

  return {
    issue: {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      url: issue.html_url,
      comments: comments.map((comment) => ({
        id: comment.id,
        author: comment.user?.login ?? null,
        body: comment.body,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        url: comment.html_url
      }))
    },
    repository: {
      owner,
      name: repo,
      defaultBranch: repository.default_branch,
      fileTree: {
        topLevel: tree.tree.filter((entry) => !entry.path.includes('/')).map(toTreeEntry),
        src: tree.tree.filter((entry) => entry.path === 'src' || entry.path.startsWith('src/')).map(toTreeEntry),
        truncated: tree.truncated === true
      }
    }
  };
}

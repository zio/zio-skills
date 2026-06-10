/**
 * GitHub History Research Tool
 *
 * Gathers design rationale, architecture decisions, and context from GitHub
 * commit history, issues, and pull requests for documentation research.
 *
 * Uses official gh CLI (https://cli.github.com/manual/) with correct command syntax
 * and JSON field names from the actual GitHub API response shapes.
 *
 * Used by: docs-research skill (Step 2: GitHub History Research)
 */

import { execSync } from 'child_process';

// ============================================================================
// Public interfaces (tool output)
// ============================================================================

export interface GitHubSearchResult {
  type: 'commit' | 'issue' | 'pr';
  id: string;
  title: string;
  url: string;
  date: string;
  author: string;
  summary: string;
}

export interface GitHubResearchContext {
  repository: string; // e.g., "zio/zio"
  topic: string;      // e.g., "Cached"
  limit?: number;     // default: 30
}

export interface ResearchFindings {
  commits: GitHubSearchResult[];
  issues: GitHubSearchResult[];
  prs: GitHubSearchResult[];
  keyInsights: string[];
  designRationale: string[];
  architectureDecisions: string[];
}

export interface IssueDetails {
  number: number;
  title: string;
  body: string;
  author: { login: string };
  createdAt: string;
  state: string;
  labels: Array<{ name: string }>;
  url: string;
  comments: Array<{
    author: { login: string };
    body: string;
    createdAt: string;
  }>;
}

export interface PrDetails {
  number: number;
  title: string;
  body: string;
  author: { login: string };
  createdAt: string;
  mergedAt: string | null;
  state: string;
  url: string;
  isDraft: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  closingIssuesReferences: Array<{ number: number; title: string; url: string }>;
  files: Array<{ path: string; additions: number; deletions: number }>;
  comments: Array<{ author: { login: string }; body: string; createdAt: string }>;
  reviews: Array<{ author: { login: string }; body: string; state: string; submittedAt: string }>;
}

export interface CommitDetails {
  sha: string;
  message: string;
  author: { name: string; date: string; login?: string };
  stats: { total: number; additions: number; deletions: number };
  files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
}

// ============================================================================
// Internal interfaces (raw gh API responses)
// ============================================================================

interface CommitSearchItem {
  sha: string;
  url: string;
  author: { login: string };
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  repository: { nameWithOwner: string };
}

interface IssueSearchItem {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  author: { login: string };
  body: string;
  state: string;
  labels: Array<{ name: string }>;
  commentsCount: number;
}

interface PrSearchItem {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  author: { login: string };
  body: string;
  state: string;
  isDraft: boolean;
  commentsCount: number;
}

// ============================================================================
// Search functions — per-command gh usage with correct --json fields
// ============================================================================

/**
 * Search for commits related to the topic
 * Uses: gh search commits "<query>" --repo owner/repo --json <fields>
 */
export function searchCommits(context: GitHubResearchContext): GitHubSearchResult[] {
  const limit = context.limit || 30;
  const query = `search commits "${context.topic}" --repo ${context.repository} --limit ${limit} --json sha,url,author,commit,repository`;

  try {
    const output = execSync(`gh ${query}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const results: CommitSearchItem[] = JSON.parse(output);

    return results.map(item => ({
      type: 'commit' as const,
      id: item.sha.substring(0, 7),
      title: item.commit.message.split('\n')[0].substring(0, 100),
      url: item.url,
      date: item.commit.author.date.split('T')[0], // YYYY-MM-DD
      author: item.author.login,
      summary: extractFirstLine(item.commit.message),
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Search for issues related to the topic
 * Uses: gh search issues "<query>" --repo owner/repo --json <fields>
 */
export function searchIssues(context: GitHubResearchContext): GitHubSearchResult[] {
  const limit = context.limit || 30;
  const query = `search issues "${context.topic}" --repo ${context.repository} --limit ${limit} --json number,title,url,createdAt,author,body,state,labels,commentsCount`;

  try {
    const output = execSync(`gh ${query}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const results: IssueSearchItem[] = JSON.parse(output);

    return results.map(item => ({
      type: 'issue' as const,
      id: String(item.number),
      title: item.title.substring(0, 100),
      url: item.url,
      date: item.createdAt.split('T')[0],
      author: item.author.login,
      summary: extractFirstLine(item.body),
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Search for pull requests related to the topic
 * Uses: gh search prs "<query>" --repo owner/repo --json <fields>
 */
export function searchPullRequests(context: GitHubResearchContext): GitHubSearchResult[] {
  const limit = context.limit || 30;
  const query = `search prs "${context.topic}" --repo ${context.repository} --limit ${limit} --json number,title,url,createdAt,author,body,state,isDraft,commentsCount`;

  try {
    const output = execSync(`gh ${query}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const results: PrSearchItem[] = JSON.parse(output);

    return results.map(item => ({
      type: 'pr' as const,
      id: String(item.number),
      title: item.title.substring(0, 100),
      url: item.url,
      date: item.createdAt.split('T')[0],
      author: item.author.login,
      summary: extractFirstLine(item.body),
    }));
  } catch (error) {
    return [];
  }
}

// ============================================================================
// Detail readers — structured JSON output, not text
// ============================================================================

/**
 * Read full issue details including comments
 * Uses: gh issue view <number> --repo owner/repo --comments --json <fields>
 * Note: comments field requires BOTH --comments flag AND --json comments
 */
export function readIssueDetails(repository: string, issueNumber: number): IssueDetails | null {
  const query = `issue view ${issueNumber} --repo ${repository} --comments --json title,number,body,author,createdAt,state,labels,comments,url`;

  try {
    const output = execSync(`gh ${query}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(output) as IssueDetails;
  } catch (error) {
    return null;
  }
}

/**
 * Read full PR details including comments and reviews
 * Uses: gh pr view <number> --repo owner/repo --comments --json <fields>
 * Note: comments field requires BOTH --comments flag AND --json comments
 */
export function readPrDetails(repository: string, prNumber: number): PrDetails | null {
  const query = `pr view ${prNumber} --repo ${repository} --comments --json title,number,body,author,createdAt,state,url,comments,files,reviews,mergedAt,isDraft,closingIssuesReferences,additions,deletions,changedFiles`;

  try {
    const output = execSync(`gh ${query}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(output) as PrDetails;
  } catch (error) {
    return null;
  }
}

/**
 * Read commit details and changed files
 * Uses: gh api repos/<owner>/<repo>/commits/<sha>
 */
export function readCommitDetails(repository: string, commitSha: string): CommitDetails | null {
  const endpoint = `repos/${repository}/commits/${commitSha}`;

  try {
    const output = execSync(`gh api ${endpoint}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const data = JSON.parse(output);

    return {
      sha: data.sha,
      message: data.commit?.message || '',
      author: {
        name: data.commit?.author?.name || 'unknown',
        date: data.commit?.author?.date || 'unknown',
        login: data.author?.login,
      },
      stats: {
        total: data.stats?.total || 0,
        additions: data.stats?.additions || 0,
        deletions: data.stats?.deletions || 0,
      },
      files: (data.files || []).map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      })),
    };
  } catch (error) {
    return null;
  }
}

// ============================================================================
// Workflow orchestration
// ============================================================================

/**
 * Comprehensive GitHub research workflow
 * Searches commits, issues, PRs and analyzes findings for key insights
 */
export async function conductGitHubResearch(context: GitHubResearchContext): Promise<ResearchFindings> {
  console.log(`[GitHub Research] Researching "${context.topic}" in ${context.repository}...`);

  // Search all three categories
  const commits = searchCommits(context);
  const issues = searchIssues(context);
  const prs = searchPullRequests(context);

  console.log(`[GitHub Research] Found: ${commits.length} commits, ${issues.length} issues, ${prs.length} PRs`);

  // Analyze high-value items
  const keyInsights: string[] = [];
  const designRationale: string[] = [];
  const architectureDecisions: string[] = [];

  // Extract insights from summaries and titles
  const allResults = [...commits, ...issues, ...prs];
  allResults.forEach(result => {
    const text = `${result.title} ${result.summary}`.toLowerCase();

    if (text.includes('design')) {
      designRationale.push(`${result.type}#${result.id}: ${result.title}`);
    }

    if (text.includes('architecture')) {
      architectureDecisions.push(`${result.type}#${result.id}: ${result.title}`);
    }

    if (text.includes('performance')) {
      keyInsights.push(`Performance in ${result.type}#${result.id}: ${result.title}`);
    }

    if (text.includes('error') || text.includes('exception')) {
      keyInsights.push(`Error handling in ${result.type}#${result.id}: ${result.title}`);
    }
  });

  return {
    commits,
    issues,
    prs,
    keyInsights: keyInsights.slice(0, 5), // Top 5
    designRationale: designRationale.slice(0, 5),
    architectureDecisions: architectureDecisions.slice(0, 5),
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format research findings into readable markdown for documentation
 */
export function formatResearchFindings(findings: ResearchFindings): string {
  const lines: string[] = [];

  lines.push('## GitHub History Research Findings\n');

  if (findings.designRationale.length > 0) {
    lines.push('### Design Rationale');
    findings.designRationale.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  if (findings.architectureDecisions.length > 0) {
    lines.push('### Architecture Decisions');
    findings.architectureDecisions.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  if (findings.keyInsights.length > 0) {
    lines.push('### Key Insights');
    findings.keyInsights.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  lines.push(`### Search Results`);
  lines.push(`- Commits: ${findings.commits.length}`);
  lines.push(`- Issues: ${findings.issues.length}`);
  lines.push(`- Pull Requests: ${findings.prs.length}`);

  return lines.join('\n');
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract first line from text
 */
function extractFirstLine(text: string): string {
  return text.split('\n')[0].substring(0, 200);
}

/**
 * GitHub History Research Tool
 *
 * Gathers design rationale, architecture decisions, and context from GitHub
 * commit history, issues, and pull requests for documentation research.
 *
 * Used by: docs-research skill (Step 2: GitHub History Research)
 */

import { execSync } from 'child_process';

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

/**
 * Execute a gh command and return JSON output
 */
function executeGhCommand(command: string, options?: { text?: boolean }): string {
  try {
    const fullCommand = `gh ${command}${options?.text ? '' : ' --json title,number,url,createdAt,author,body'}`;
    return execSync(fullCommand, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    return '[]';
  }
}

/**
 * Search for commits related to the topic
 */
export function searchCommits(context: GitHubResearchContext): GitHubSearchResult[] {
  const limit = context.limit || 30;
  const query = `search commits --repo ${context.repository} "${context.topic}" --limit ${limit}`;

  try {
    const output = executeGhCommand(query);
    const results = JSON.parse(output);

    return results.map((item: any) => ({
      type: 'commit' as const,
      id: item.number || item.oid?.substring(0, 7) || 'unknown',
      title: item.title || item.message?.split('\n')[0] || 'No title',
      url: item.url || '',
      date: item.createdAt || 'unknown',
      author: item.author?.name || 'unknown',
      summary: extractFirstLine(item.body || item.message || ''),
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Search for issues related to the topic
 */
export function searchIssues(context: GitHubResearchContext): GitHubSearchResult[] {
  const limit = context.limit || 30;
  const query = `search issues --repo ${context.repository} "${context.topic}" --limit ${limit}`;

  try {
    const output = executeGhCommand(query);
    const results = JSON.parse(output);

    return results.map((item: any) => ({
      type: 'issue' as const,
      id: String(item.number),
      title: item.title || 'No title',
      url: item.url || '',
      date: item.createdAt || 'unknown',
      author: item.author?.name || 'unknown',
      summary: extractFirstLine(item.body || ''),
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Search for pull requests related to the topic
 */
export function searchPullRequests(context: GitHubResearchContext): GitHubSearchResult[] {
  const limit = context.limit || 30;
  const query = `search prs --repo ${context.repository} "${context.topic}" --limit ${limit}`;

  try {
    const output = executeGhCommand(query);
    const results = JSON.parse(output);

    return results.map((item: any) => ({
      type: 'pr' as const,
      id: String(item.number),
      title: item.title || 'No title',
      url: item.url || '',
      date: item.createdAt || 'unknown',
      author: item.author?.name || 'unknown',
      summary: extractFirstLine(item.body || ''),
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Read full issue details including comments
 */
export function readIssueDetails(repository: string, issueNumber: number): string {
  try {
    const output = execSync(
      `gh issue view ${issueNumber} --repo ${repository} --comments`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return output;
  } catch (error) {
    return '';
  }
}

/**
 * Read full PR details including comments and reviews
 */
export function readPullRequestDetails(repository: string, prNumber: number): string {
  try {
    const output = execSync(
      `gh pr view ${prNumber} --repo ${repository} --comments`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return output;
  } catch (error) {
    return '';
  }
}

/**
 * Read commit details and changed files
 */
export function readCommitDetails(repository: string, commitSha: string): string {
  try {
    const output = execSync(
      `gh api repos/${repository}/commits/${commitSha}`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const data = JSON.parse(output);
    return formatCommitDetails(data);
  } catch (error) {
    return '';
  }
}

/**
 * Comprehensive GitHub research workflow
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
    // Look for design-related keywords
    if (result.summary.toLowerCase().includes('design') ||
        result.title.toLowerCase().includes('design')) {
      designRationale.push(`${result.type}#${result.id}: ${result.title}`);
    }

    if (result.summary.toLowerCase().includes('architecture') ||
        result.title.toLowerCase().includes('architecture')) {
      architectureDecisions.push(`${result.type}#${result.id}: ${result.title}`);
    }

    if (result.summary.toLowerCase().includes('performance') ||
        result.title.toLowerCase().includes('performance')) {
      keyInsights.push(`Performance consideration in ${result.type}#${result.id}: ${result.title}`);
    }

    if (result.summary.toLowerCase().includes('error') ||
        result.summary.toLowerCase().includes('exception')) {
      keyInsights.push(`Error handling pattern in ${result.type}#${result.id}: ${result.title}`);
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

/**
 * Helper: Extract first line from text
 */
function extractFirstLine(text: string): string {
  return text.split('\n')[0].substring(0, 200);
}

/**
 * Helper: Format commit details for readability
 */
function formatCommitDetails(commit: any): string {
  const lines: string[] = [];
  lines.push(`# Commit: ${commit.sha?.substring(0, 7)}`);
  lines.push(`Author: ${commit.commit?.author?.name}`);
  lines.push(`Date: ${commit.commit?.author?.date}`);
  lines.push('');
  lines.push(commit.commit?.message || '');
  lines.push('');

  if (commit.files && commit.files.length > 0) {
    lines.push(`Changed files (${commit.files.length}):`);
    commit.files.slice(0, 10).forEach((file: any) => {
      lines.push(`  - ${file.filename} (${file.changes} changes)`);
    });
  }

  return lines.join('\n');
}

/**
 * Format research findings for documentation
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

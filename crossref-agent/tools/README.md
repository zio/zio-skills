# Flue Agent Tools

Custom tools for Flue agents to accomplish documentation research and writing tasks.

## github-research.ts

**Purpose:** Gather design rationale, architecture decisions, and context from GitHub history for documentation research.

**Part of:** Step 2 of the docs-research skill (GitHub History Research)

**Based on:** Official GitHub CLI manual (https://cli.github.com/manual/)

### Functions

#### `conductGitHubResearch(context: GitHubResearchContext): Promise<ResearchFindings>`

The main entry point for comprehensive GitHub research. Searches commits, issues, and PRs, then analyzes findings for key insights.

**Parameters:**
```typescript
interface GitHubResearchContext {
  repository: string;  // e.g., "zio/zio"
  topic: string;       // e.g., "Cached"
  limit?: number;      // Default: 30 (per search type)
}
```

**Returns:**
```typescript
interface ResearchFindings {
  commits: GitHubSearchResult[];        // Matching commits
  issues: GitHubSearchResult[];         // Matching issues
  prs: GitHubSearchResult[];            // Matching pull requests
  keyInsights: string[];                // Performance, errors, patterns
  designRationale: string[];            // Design-related items (top 5)
  architectureDecisions: string[];      // Architecture-related items (top 5)
}
```

**Example:**
```typescript
const findings = await conductGitHubResearch({
  repository: 'zio/zio',
  topic: 'Cached',
  limit: 30
});

console.log(findings.designRationale);     // Top 5 design discussions
console.log(findings.architectureDecisions); // Top 5 architecture items
```

---

#### `searchCommits(context: GitHubResearchContext): GitHubSearchResult[]`

Search for commits related to the topic.

Uses: `gh search commits "<topic>" --repo owner/repo --json sha,url,author,commit,repository`

```typescript
const commits = searchCommits({
  repository: 'zio/zio',
  topic: 'Cached',
  limit: 20
});
// Returns: id (short sha), title (first line of message), url, date, author (login), summary
```

---

#### `searchIssues(context: GitHubResearchContext): GitHubSearchResult[]`

Search for issues related to the topic.

Uses: `gh search issues "<topic>" --repo owner/repo --json number,title,url,createdAt,author,body,state,labels,commentsCount`

```typescript
const issues = searchIssues({
  repository: 'zio/zio',
  topic: 'Cached'
});
```

---

#### `searchPullRequests(context: GitHubResearchContext): GitHubSearchResult[]`

Search for pull requests related to the topic.

Uses: `gh search prs "<topic>" --repo owner/repo --json number,title,url,createdAt,author,body,state,isDraft,commentsCount`

```typescript
const prs = searchPullRequests({
  repository: 'zio/zio',
  topic: 'Cached'
});
```

---

#### `readIssueDetails(repository: string, issueNumber: number): IssueDetails | null`

Read the full issue discussion including all comments.

Used for high-value issues to understand detailed design discussions.

Uses: `gh issue view <number> --repo owner/repo --comments --json <fields>`

**Returns:**
```typescript
interface IssueDetails {
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
```

**Example:**
```typescript
const issue = findings.issues[0];
if (issue) {
  const details = readIssueDetails('zio/zio', parseInt(issue.id));
  console.log(details.comments); // All comments on this issue
}
```

---

#### `readPrDetails(repository: string, prNumber: number): PrDetails | null`

Read the full PR discussion including comments and code reviews.

Used for understanding implementation context and decisions.

Uses: `gh pr view <number> --repo owner/repo --comments --json <fields>`

**Returns:**
```typescript
interface PrDetails {
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
```

---

#### `readCommitDetails(repository: string, commitSha: string): CommitDetails | null`

Read detailed commit information including changed files.

Used for understanding specific implementation changes.

Uses: `gh api repos/<owner>/<repo>/commits/<sha>`

**Returns:**
```typescript
interface CommitDetails {
  sha: string;
  message: string;
  author: { name: string; date: string; login?: string };
  stats: { total: number; additions: number; deletions: number };
  files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
}
```

---

#### `formatResearchFindings(findings: ResearchFindings): string`

Format research findings into readable markdown for documentation.

```typescript
const findings = await conductGitHubResearch({...});
const report = formatResearchFindings(findings);
console.log(report);
// Outputs structured markdown with design rationale, architecture decisions, insights
```

---

## Usage in Research Workflows

### From the docs-research Skill

When performing Step 2 (GitHub History Research):

```typescript
import { conductGitHubResearch, readIssueDetails, readPrDetails } from '../tools/github-research.js';

const findings = await conductGitHubResearch({
  repository: 'zio/zio',
  topic: 'Cached',
  limit: 30
});

// Findings are automatically categorized
const designContext = findings.designRationale.join('\n');
const archDecisions = findings.architectureDecisions.join('\n');
const keyPoints = findings.keyInsights.join('\n');

// For high-value items, read full discussions
const issue = findings.issues[0];
if (issue) {
  const fullDiscussion = readIssueDetails('zio/zio', parseInt(issue.id));
  if (fullDiscussion) {
    // Use fullDiscussion in research notes
    fullDiscussion.comments.forEach(c => {
      // Process comment
    });
  }
}
```

---

## Prerequisites

Requires `gh` (GitHub CLI) to be installed and authenticated:

```bash
# Install GitHub CLI
brew install gh  # or your package manager

# Authenticate (interactive)
gh auth login
```

The agent's `local()` sandbox in `agents/docs-writer.ts` has shell access to run `gh` commands.

---

## Error Handling

All functions gracefully handle errors:
- If `gh` is not installed or not authenticated, search functions return empty arrays
- Detail reader functions (`readIssueDetails`, `readPrDetails`, `readCommitDetails`) return `null` if the item is not found
- The workflow continues with available findings

---

## GitHub CLI Commands Used

This tool uses these official `gh` commands:

| Command | Purpose | Notes |
|---------|---------|-------|
| `gh search commits` | Find commits by topic | Returns short SHA, message, author login, dates |
| `gh search issues` | Find issues by topic | Returns number, title, author login, body, state, labels |
| `gh search prs` | Find PRs by topic | Returns number, title, author login, body, state, isDraft |
| `gh issue view` | Get full issue details | Requires `--comments` to populate comments field |
| `gh pr view` | Get full PR details | Richest field set; includes diffs, reviews, merged status |
| `gh api` | Direct REST API calls | Used for commit details with full file stats |

All commands use `--json` flags to return structured data instead of human-readable text, making results easy for agents to parse.

---

## Related

- **docs-research skill:** `crossref-agent/skills/docs-research/SKILL.md`
- **Research phase:** `crossref-agent/workflows/phases/research.ts`
- **Agent:** `crossref-agent/agents/docs-writer.ts`
- **GitHub CLI manual:** https://cli.github.com/manual/

# Flue Agent Tools

Custom tools for Flue agents to accomplish documentation research and writing tasks.

## github-research.ts

**Purpose:** Gather design rationale, architecture decisions, and context from GitHub history for documentation research.

**Part of:** Step 2 of the docs-research skill (GitHub History Research)

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
  keyInsights: string[];                // Performance, errors, etc.
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

```typescript
const commits = searchCommits({
  repository: 'zio/zio',
  topic: 'Cached',
  limit: 20
});
```

---

#### `searchIssues(context: GitHubResearchContext): GitHubSearchResult[]`

Search for issues related to the topic.

```typescript
const issues = searchIssues({
  repository: 'zio/zio',
  topic: 'Cached'
});
```

---

#### `searchPullRequests(context: GitHubResearchContext): GitHubSearchResult[]`

Search for pull requests related to the topic.

```typescript
const prs = searchPullRequests({
  repository: 'zio/zio',
  topic: 'Cached'
});
```

---

#### `readIssueDetails(repository: string, issueNumber: number): string`

Read the full issue discussion including all comments.

Used for high-value issues to understand detailed design discussions.

```typescript
const discussion = readIssueDetails('zio/zio', 1234);
// Returns full issue text with comments
```

---

#### `readPullRequestDetails(repository: string, prNumber: number): string`

Read the full PR discussion including comments and code review.

Used for understanding implementation context and decisions.

```typescript
const discussion = readPullRequestDetails('zio/zio', 5678);
// Returns full PR description, diffs, and review comments
```

---

#### `readCommitDetails(repository: string, commitSha: string): string`

Read detailed commit information including changed files.

Used for understanding specific implementation changes.

```typescript
const details = readCommitDetails('zio/zio', 'abc123def456');
// Returns formatted commit message and file changes
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
import { conductGitHubResearch } from '../tools/github-research.js';

const findings = await conductGitHubResearch({
  repository: 'zio/zio',
  topic: 'Cached',
  limit: 30
});

// Extract key insights
const designContext = findings.designRationale.join('\n');
const archDecisions = findings.architectureDecisions.join('\n');
const keyPoints = findings.keyInsights.join('\n');

// For high-value items, read full discussions
const issue = findings.issues[0];
if (issue) {
  const fullDiscussion = readIssueDetails('zio/zio', parseInt(issue.id));
  // Use fullDiscussion in research notes
}
```

---

## Prerequisites

Requires `gh` (GitHub CLI) to be installed and authenticated:

```bash
# Install GitHub CLI
brew install gh  # or your package manager

# Authenticate
gh auth login
```

The agent's `local()` sandbox in `agents/docs-writer.ts` has shell access to run `gh` commands.

---

## Error Handling

All functions gracefully handle errors:
- If `gh` is not installed or not authenticated, search functions return empty arrays
- If a specific issue/PR/commit is not found, the read functions return empty strings
- The workflow continues with available findings

---

## Extension Points

### Adding new search types

```typescript
export function searchDiscussions(context: GitHubResearchContext): GitHubSearchResult[] {
  // Similar pattern to searchIssues, but for discussions
}
```

### Customizing analysis

Modify `conductGitHubResearch()` to look for additional keywords relevant to your documentation domain.

### Filtering results

Add a `filterResults()` helper to post-process search results by date, author, etc.

---

## Related

- **docs-research skill:** `crossref-agent/skills/docs-research/SKILL.md`
- **Research phase:** `crossref-agent/workflows/phases/research.ts`
- **Agent:** `crossref-agent/agents/docs-writer.ts`

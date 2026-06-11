# Coding-Agent Integration

The writer-assistant now includes an integrated `coding-agent` for verification tasks during the issue development cycle.

## Overview

The coding-agent is a specialized agent that can execute custom coding tasks in a project directory. It's available as a standalone workflow and can also be invoked during the verification phase of the crossref workflow.

## File Structure

- **`agents/coding-agent.ts`** - Agent definition with instructions for focused, minimal fixes
- **`workflows/coding-agent.ts`** - Standalone workflow for running coding tasks

## Usage

### Standalone Workflow

Use the coding-agent as a standalone workflow to run custom coding tasks:

```javascript
const response = await flueClient.workflow({
  name: 'coding-agent',
  payload: {
    pwd: '/path/to/project',
    prompt: 'Run npm test and fix any failures'
  }
});
```

**Required Parameters:**
- `pwd` (string) - Working directory where commands should execute
- `prompt` (string) - Task description for the agent to execute

### Integration with Crossref Verify-and-Fix

The coding-agent can be integrated into the `verify-and-fix` mode of the crossref workflow to run custom verification checks after a successful build:

```javascript
const response = await flueClient.workflow({
  name: 'crossref',
  payload: {
    projectRoot: '/home/milad/docs-project',
    mode: 'verify-and-fix',
    maxRetries: 3,
    verificationPrompt: 'Run npm test and ensure all tests pass'  // Optional
  }
});
```

**When `verificationPrompt` is provided:**
1. The workflow runs the normal verify-and-fix cycle
2. If the build passes, it additionally runs the coding-agent with your custom prompt
3. The verification result is included in the response

## Agent Behavior

The coding-agent follows these principles:

1. **Focused Execution** - Works only in the specified directory
2. **Build-Driven** - Runs build commands and reads error output
3. **Minimal Fixes** - Makes targeted fixes without refactoring
4. **Verification** - Re-runs builds to confirm success

## Example Use Cases

### Verification Task
```javascript
verificationPrompt: 'Run the test suite and verify all tests pass'
```

### Code Quality Check
```javascript
verificationPrompt: 'Run linting checks and fix any auto-fixable issues'
```

### Dependency Verification
```javascript
verificationPrompt: 'Check package.json versions and run npm audit'
```

## Event Logging

The coding-agent workflow subscribes to execution events and logs:
- 🔧 Tool calls with arguments
- ✅ Tool execution results
- ❌ Tool errors

This provides full visibility into what the agent is doing.

## Integration with Crossref Workflow

The coding-agent is integrated into the crossref verification phase:

1. **Phase 1** - Normal build verification via `verifyBuild()`
2. **Phase 1.5** (Optional) - Custom verification via `verificationPrompt`
3. **Phase 2** - Error extraction and fixing

If the build succeeds and no verification prompt is specified, the workflow completes normally. If a verification prompt is provided and the build passes, the coding-agent runs your custom verification task.

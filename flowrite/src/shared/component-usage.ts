import { observe, type FlueEvent } from '@flue/runtime';
import { getRepoPath } from './run-context.ts';
import { researchTutorialTopic } from '../phases/research-tutorial-topic.ts';
import { designTutorialStructure } from '../phases/design-tutorial-structure.ts';
import { writeTutorialDraft } from '../phases/write-tutorial-draft.ts';
import { writeCompanionExamples } from '../phases/write-companion-examples.ts';
import { integrateTutorial } from '../phases/integrate.ts';
import { reviewTutorial } from '../phases/review-page.ts';
import { researchDataType } from '../phases/research-data-type.ts';
import { designDataTypeStructure } from '../phases/design-data-type-structure.ts';
import { writeDataTypeReference } from '../phases/write-data-type-reference.ts';
import { integrateDataTypeReference } from '../phases/integrate.ts';
import { reviewDataTypeRef } from '../phases/review-page.ts';
import { researchModule } from '../phases/research-module.ts';
import { designModuleStructure } from '../phases/design-module-structure.ts';
import { writeModuleOverview } from '../phases/write-module-overview.ts';
import { integrateModuleReference } from '../phases/integrate-module.ts';
import { reviewModuleRef } from '../phases/review-page.ts';

/**
 * Every agent's own phase tools — model-callable, but delegating their real work
 * to a role. Reported under the 'phase' category to separate them from the generic
 * tools; Flue 2 has no Actions concept, these are ordinary `harness: true` tools.
 */
const PHASE_TOOLS = new Set(
  [
    researchTutorialTopic,
    designTutorialStructure,
    writeTutorialDraft,
    writeCompanionExamples,
    integrateTutorial,
    reviewTutorial,
    researchDataType,
    designDataTypeStructure,
    writeDataTypeReference,
    integrateDataTypeReference,
    reviewDataTypeRef,
    researchModule,
    designModuleStructure,
    writeModuleOverview,
    integrateModuleReference,
    reviewModuleRef,
  ].map((a) => a.name),
);

export type ComponentCategory = 'phase' | 'subagent' | 'tool' | 'skill' | 'agent';

export interface ComponentUsage {
  category: ComponentCategory;
  name: string;
  calls: number;
  tokens: number;
  cost: number;
}

/**
 * What one phase of the pipeline cost, end to end.
 *
 * `own` is the phase's own harness conversation — the turns that decide what to ask for and read
 * the results back. `delegate` is what its roles spent. The distinction is the interesting one: in a
 * measured run the review phase's own conversation cost $1.67 against $0.99 for all three of its
 * roles, so the expensive part was the coordination, not the reviewing.
 */
export interface PhaseUsage {
  /** Phase tool name, or '(between phases)' for the writer's own turns outside any phase. */
  phase: string;
  ownTurns: number;
  ownTokens: number;
  ownCost: number;
  delegateTurns: number;
  delegateTokens: number;
  delegateCost: number;
  /** own + delegate, the figure to compare phases by. */
  totalTokens: number;
  totalCost: number;
}

/**
 * What the run *did*, as counts — with no cost column, deliberately.
 *
 * `bash`, `read`, `edit` and friends are local operations with no model call, so their cost is
 * genuinely zero. Reporting that zero next to real money was the whole complaint about the old flat
 * table: it invites the reader to think the number is broken. The informative fact about `bash` is
 * the 20, not the $0.
 */
export interface ActivityReport {
  /** Call counts per ordinary tool. */
  tools: Record<string, number>;
  /** Failures per tool, any category. */
  toolErrors: Record<string, number>;
  /** Phase calls that ended isError=true — paid-for work that was thrown away. */
  phaseFailures: Record<string, number>;
  /** Skills the model activated, in the order first seen. */
  skills: string[];
  /** Phase tool call counts, so a repeated phase is visible. */
  phaseCalls: Record<string, number>;
  cdViolations: number;
}

export interface ComponentUsageTracker {
  /** Snapshot of accumulated per-component usage, grouped by category then name. */
  report(): ComponentUsage[];
  /** Snapshot of accumulated per-phase usage, most expensive first. */
  phases(): PhaseUsage[];
  /** Snapshot of what the run did, as counts. */
  activity(): ActivityReport;
  stop(): ComponentUsage[];
}

function entryFor(components: Map<string, ComponentUsage>, category: ComponentCategory, name: string) {
  const key = `${category}:${name}`;
  let entry = components.get(key);
  if (!entry) {
    entry = { category, name, calls: 0, tokens: 0, cost: 0 };
    components.set(key, entry);
  }
  return entry;
}

/**
 * Subscribe to runtime activity and tally calls + token usage per component
 * (phase/subagent/tool/skill/agent), for a final per-run breakdown alongside
 * the aggregate total from `trackTokenUsage`.
 *
 * Call counts come from `tool_start` (phase tools, repo/generic tools, skill
 * loads) and `task_start` (role delegation via `event.agent`). Token usage comes
 * from `turn` events, attributed by the most specific envelope field available —
 * so phase tools never double-count the tokens their delegated role already
 * accounts for.
 *
 * Attribution order, most specific first:
 *  - `taskId` mapped back to the role recorded at `task_start` → that role. Verified
 *    against a real run: a delegate's turns do carry `taskId`, so role cost is exact.
 *  - otherwise `harness`, `session`, then `agentName` → the writer itself. Every
 *    turn in a run carries `harness` (a delegate inherits the parent's), and the
 *    field holds the harness's own name — "default" — not the owning tool's, so
 *    harness turns cannot be split per phase from that field. They aggregate under
 *    the writer, which is why `agent:default` is the largest line in every run.
 *
 * The totals reconcile: role tokens plus writer tokens equal the run total, which is
 * the property that matters — no turn goes uncounted.
 *
 * `phases()` splits that same spending by which phase was running, which the component view cannot
 * show. It keys on a stack of open PHASE tools, and the "phase tools only" part is the whole trick:
 * an earlier attempt at this pushed *every* tool and reported zero for the phases, because during a
 * long phase the innermost open tool is nearly always `bash` or `edit`, never the phase itself. The
 * note left behind blamed turn events not arriving between a phase's start and end; walking a real
 * run's log disproved that — 84% of the writer's tokens fell inside the review phase's window, and
 * only 12% outside any phase.
 */
export function trackComponentUsage(): ComponentUsageTracker {
  const components = new Map<string, ComponentUsage>();
  // A delegated task's turns carry the generated `taskId` correlation field, not
  // the subagent's own name, in `event.session` — map taskId back to the
  // subagent name recorded at task_start so turn tokens land on the right entry.
  const subagentByTaskId = new Map<string, string>();

  const phases = new Map<string, PhaseUsage>();
  const BETWEEN = '(between phases)';
  // Open phase tools, innermost last. Phase tools only — see the note above on why including
  // ordinary tools makes this report zeros.
  const openPhases: string[] = [];
  const phaseEntry = (name: string) => {
    let entry = phases.get(name);
    if (!entry) {
      entry = {
        phase: name,
        ownTurns: 0,
        ownTokens: 0,
        ownCost: 0,
        delegateTurns: 0,
        delegateTokens: 0,
        delegateCost: 0,
        totalTokens: 0,
        totalCost: 0,
      };
      phases.set(name, entry);
    }
    return entry;
  };

  // Failures per tool. `read` on a guessed path and `edit` on a stale `old_string` are the common
  // ones, and a run with several is usually looping rather than progressing.
  const toolErrors = new Map<string, number>();
  // Phase calls that ended isError=true — work paid for and thrown away.
  const phaseFailures = new Map<string, number>();
  // bash commands that cd into the repo, against SHARED_DIRECTIVE's "do not cd into the repo".
  // An earlier run did it 76 times.
  let cdViolations = 0;

  const unsubscribe = observe((event: FlueEvent) => {
    if (event.type === 'tool_start' && PHASE_TOOLS.has(event.toolName)) openPhases.push(event.toolName);
    // The completion event is `tool`, not `tool_end` — `tool_start` has no symmetric partner.
    if (event.type === 'tool') {
      if (event.isError) {
        toolErrors.set(event.toolName, (toolErrors.get(event.toolName) ?? 0) + 1);
        if (PHASE_TOOLS.has(event.toolName)) {
          phaseFailures.set(event.toolName, (phaseFailures.get(event.toolName) ?? 0) + 1);
        }
      }
      if (PHASE_TOOLS.has(event.toolName)) {
        // Remove the innermost occurrence, not the first: a module run can have the same phase open
        // twice concurrently (one research_data_type per core type).
        const at = openPhases.lastIndexOf(event.toolName);
        if (at !== -1) openPhases.splice(at, 1);
      }
    }

    if (event.type === 'tool_start' && event.toolName === 'bash') {
      // Read defensively: this runs inside every run, and neither a surprising args shape nor an
      // unset run context may throw and take the run down with it — getRepoPath() throws before the
      // first render has published the context. Matching the repo path specifically: `cd website`
      // for a subdirectory build is legitimate, `cd /abs/path/to/checkout` is the wasted one.
      const command = String((event.args as { command?: unknown } | undefined)?.command ?? '');
      let repoPath: string | undefined;
      try {
        repoPath = getRepoPath();
      } catch {
        repoPath = undefined;
      }
      if (repoPath && command.includes(`cd ${repoPath}`)) cdViolations += 1;
    }

    if (event.type === 'tool_start') {
      const category: ComponentCategory = PHASE_TOOLS.has(event.toolName)
        ? 'phase'
        : event.toolName === 'activate_skill'
          ? 'skill'
          : 'tool';
      const name = category === 'skill' ? String((event.args as any)?.name ?? 'unknown') : event.toolName;
      entryFor(components, category, name).calls += 1;
      return;
    }

    if (event.type === 'task_start') {
      if (event.agent) {
        entryFor(components, 'subagent', event.agent).calls += 1;
        if (event.taskId) subagentByTaskId.set(event.taskId, event.agent);
      }
      return;
    }

    if (event.type === 'turn') {
      const u = event.response.usage;
      if (!u) return;
      const role = event.taskId ? subagentByTaskId.get(event.taskId) : undefined;
      const name = role ?? event.harness ?? event.session ?? event.agentName;
      if (!name) return;
      const category: ComponentCategory = role ? 'subagent' : 'agent';
      const entry = entryFor(components, category, name);
      entry.tokens += u.totalTokens;
      entry.cost += u.cost.total;

      // Same turn, filed a second way: by which phase was running. With parallel phase calls this
      // credits the most recently started one, so a module run's concurrent per-type phases are
      // approximate; sequential runs are exact.
      const phase = phaseEntry(openPhases.at(-1) ?? BETWEEN);
      if (role) {
        phase.delegateTurns += 1;
        phase.delegateTokens += u.totalTokens;
        phase.delegateCost += u.cost.total;
      } else {
        phase.ownTurns += 1;
        phase.ownTokens += u.totalTokens;
        phase.ownCost += u.cost.total;
      }
      phase.totalTokens = phase.ownTokens + phase.delegateTokens;
      phase.totalCost = phase.ownCost + phase.delegateCost;
    }
  });

  const report = () =>
    [...components.values()].sort((a, b) => a.category.localeCompare(b.category) || b.calls - a.calls);

  const phaseReport = () => [...phases.values()].sort((a, b) => b.totalCost - a.totalCost);

  const byCategory = (category: ComponentCategory): Record<string, number> =>
    Object.fromEntries(
      [...components.values()].filter((c) => c.category === category).map((c) => [c.name, c.calls]),
    );

  const activityReport = (): ActivityReport => ({
    tools: byCategory('tool'),
    toolErrors: Object.fromEntries(toolErrors),
    phaseFailures: Object.fromEntries(phaseFailures),
    skills: [...components.values()].filter((c) => c.category === 'skill').map((c) => c.name),
    phaseCalls: byCategory('phase'),
    cdViolations,
  });

  let stopped = false;
  return {
    report,
    phases: phaseReport,
    activity: activityReport,
    stop() {
      if (!stopped) {
        unsubscribe();
        stopped = true;
      }
      return report();
    },
  };
}

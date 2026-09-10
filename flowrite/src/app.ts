import { createAgentRouter } from '@flue/runtime/routing';
import { DocsWriter } from './agent.ts';

/**
 * The route map.
 *
 * Flue mounts nothing on its own — "Registering an agent … makes it addressable inside your
 * application; serving it over HTTP is a separate, explicit decision" (guide/routing) — so this file
 * is what makes the writer reachable over HTTP.
 *
 * flowrite's own runs do not go through here. They are `flue run src/agent.ts`, which invokes the
 * agent directly and never reads this module. It exists so that `vite build` produces a server, and so
 * channels, schedules and the SDK have something to talk to when they are wanted.
 *
 * One route, mounted at the root, and now the only agent there is: every former standalone maintenance
 * agent (redundancy, metadata, crossref, organize, add-section, check-compliance, enrich-section,
 * find-gaps, list-undocumented-prs, retrospect, document-pr, pr-subsection) is a gate-phase skill on
 * `DocsWriter` now rather than its own `'use agent'` module, so there is nothing left to leave
 * unmounted. `scripts/backfill-metadata.sh` drives its loop with `flue run src/agent.ts -m "…"` per
 * page, the same entry point every other request uses.
 */
export default createAgentRouter(DocsWriter);

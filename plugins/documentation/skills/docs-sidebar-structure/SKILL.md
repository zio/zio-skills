---
name: docs-sidebar-structure
description: Restructure or reorder the sidebar of a ZIO project's docs site (zio.dev/<project>/). Use when asked to change sidebar order, add Getting Started / Reference / Tutorial / How-to sections, expand or collapse sidebar categories, or wire a project's existing pages into the ZIO ecosystem sidebar. For adding one new page, use docs-integrate instead.
allowed-tools: Read, Edit, Glob, Grep, Bash(git:*), Bash(curl:*)
---

# Structuring a ZIO project's sidebar

Each ZIO library has its own docs site section at `zio.dev/<project>/`. The left sidebar lists that
project's pages. The order and grouping come from the project's `sidebars.js`, and the main ZIO website
builds one sidebar per project from it.

This skill restructures a whole sidebar. The section order, the rules for each section and the
"a section with one page is a plain item" rule are defined once, in `docs-integrate` Step 1. Read that
step first and follow it; do not copy it here.

## Where the code lives

- **The project's own `sidebars.js`** (in that library's repo, for example `zio/zio-amqp`) decides the
  order and grouping. Its `sidebar` array order is the display order, and the ZIO website keeps it.
- **`zio/zio` `website/plugins/zio-ecosystem-docusaurus/index.ts`** builds the per-project sidebars:
  - `mapConfig` sets every nested category to `collapsed: true` and keeps item order.
  - `expandedProjects` (a `Set` of project names) turns off collapsing for the nested categories of the
    listed projects only.
  - `itemsWithoutOwnPage` drops a category's own index page from the list.
  - `.sort` on the ecosystem categories sorts by label; it does not change a project's own order.
- **`website/ecosystem-categories.json`** says which ecosystem group a project belongs to. Changing the
  group does not change a project's internal order.
- **`website/sidebars.js`** in `zio/zio` only wires the ecosystem sidebar. Never edit it to reorder one
  project, and never hand-edit the generated `ecosystem-sidebar.js` or `per-project-sidebars.js`.

Order inside a project is that project's `sidebars.js`. Expansion is `expandedProjects` in `zio/zio`.

## Steps

1. **Read the current sidebar.** Open the project's `sidebars.js` (`git ls-files "*sidebars.js"`) and list
   its items in order. Confirm the index page id (usually `index`).
2. **Group the pages by type.** Put each doc under exactly one section of `docs-integrate` Step 1. If no
   `getting-started.md` exists, write one (install, first program, next steps). `index.md` is the README
   source (`docs/generateReadme`): when install or example text moves from it into `getting-started.md`,
   ask the user how much to keep in `index.md`.
3. **Write the sections in that order.** The top-level `sidebar` array holds `"index"`,
   `"getting-started"` and the other sections as siblings, with no wrapping project category linked to
   `index`. A section with only one page, and a Concepts section with fewer than 3 pages, is written as
   plain doc items, not a category, as `docs-integrate` describes.
4. **Decide collapse.** `collapsed: false` on Reference and its nested categories; `collapsed: true` on
   Tutorials and How-to Guides. Add the project to `expandedProjects` in `zio/zio` only when the user asks
   for expanded nested categories.
5. **Check the ids.** Every `id` must match a real doc path, or the build fails. Grep the docs folder for
   each id. Keep existing doc ids stable: moving one needs a redirect on zio.dev. Check the live URLs
   (`curl` zio.dev) before asking for a redirect.
6. **Build locally** when the user asks (it is slow), or verify after deploy.
7. **Verify live** after deploy: `curl -s https://zio.dev/<project>/` and extract the sidebar labels in
   order (labels inside `menu__link`). Expanded categories have no `menu__list-item--collapsed` class;
   use a project that is not expanded as a control, since its nested categories stay collapsed.

## Gotchas

- **Local preview:** `docusaurus start` hot-reloads pages, not the `sidebars.js` loaded through
  `sidebarPath`, and it misses new pages added while it runs. Use a static build and serve instead: stop
  the server, remove `website/docs`, `.docusaurus` and `build`, render the docs, then build and serve.
  Check the webpack line `compiled successfully`; `curl` on a dev-server page returns only the client
  shell. Never run `docusaurus build` in the same `website/` as a running `start`, because they share
  `.docusaurus/`.
- **Preview from a scratch clone:** set its `origin` to `https://github.com/zio/<project>.git`, or
  `@PROJECT_BADGES@` renders "github repo not provided" (`scmInfo` comes from the git origin).
- **Deploys:** `zio.dev` is built by the "Deploy Website" workflow (`site.yml`) on `series/2.x`, not on
  push. A sidebar change in a project repo needs a new `@zio.dev/<project>` package version bumped into
  `zio/zio` `website/package.json`, then a deploy.
- **Labels:** keep them short and the same across projects: "Introduction", "Getting Started",
  "Reference", "Tutorials", "How-to Guides".

## Questions to ask the user

- Which page is Getting Started, if the project's index is not the right landing page?
- Should nested categories be expanded (`expandedProjects`) or collapsed?
- Does the change belong in the project's own repo (usual) or in `zio/zio` only?

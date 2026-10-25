# obsidian-blog: project mindset

A personal blog that publishes an Obsidian vault (`../obsidian`) to the web. Read this before changing anything.

## The bar: a UI/UX masterpiece

- **Reading comes first.** The design exists to make long, technical deep dives a pleasure to read: an editorial
  serif for titles, a calm sans for UI, a ~68ch measure, generous whitespace, one restrained accent colour, and
  light and dark themes treated as equals (no flash on load).
- **Simple and elegant beats clever.** Every element earns its place. No gimmicks, no clutter, no dark patterns,
  no toasts or modals where inline feedback works.
- **Full of micro-interactions, all built with Motion (`motion/react`).** Hover lifts, link underlines that draw,
  a theme toggle that morphs, a reading progress bar, a TOC indicator that slides, copy-code feedback, animated
  callout folds, filter pills with `layoutId`, a command palette, image and diagram zoom, skeletons for streamed
  sections. Use the shared spring presets in `src/lib/motion.ts` so the whole site moves the same way. Motion must be fast,
  subtle and purposeful, never block reading, and respect `prefers-reduced-motion` (`MotionConfig reducedMotion="user"`).
- **Mobile is first-class.** 16px gutters, comfortable tap targets, no horizontal page scroll (code, tables and
  Mermaid diagrams scroll inside their own box), and layouts designed at 375px first.
- **Accessible by default.** Semantic landmarks, visible focus rings, keyboard paths for every interaction
  (palette, TOC, callouts, lightbox), and `aria-*` on custom controls.
- **Content is the user's Obsidian notes.** Obsidian syntax (wikilinks, callouts, embeds, Mermaid, footnotes,
  math) must render beautifully, and Mermaid diagrams must match the design tokens in both themes.
- New UI must hold that bar. If a change makes the site feel heavier, noisier or slower, it is wrong even when it works.

## Architecture invariants

- **TanStack Start on Vite+.** Use `vp` for everything (see below). File routes live in `src/routes`. Server functions use
  `createServerFn().validator(zod).handler()` and are called as `fn({ data })`. Search params are validated with
  zod 4 in `validateSearch`.
- **Server-only work stays behind explicit boundaries:** `*.server.ts` modules (`src/content/posts.server.ts`,
  `access.server.ts`, `site-url.server.ts`) reached only through server functions or server routes. No runtime
  `fs` reads: content is bundled at build time, so the same code runs on any runtime.
- **The SSR mode is chosen per route on purpose:** full SSR plus streamed `<Await>` sections for content pages,
  `'data-only'` for `/search`, `false` for the canvas `/graph`. Keep the reason in a comment when adding a route.
- **Privacy is a hard rule.** Private notes (`visibility: private`, a `.private` folder) must never reach the client
  bundle, lists, search, graph, RSS, sitemap or backlinks for non-admins. Their bodies only travel through the
  admin-gated `getPrivateBody`. Any new data surface must filter through the viewer (`getViewer`/`canViewPrivate`).
  Login is planned; plug it into `access.server.ts`.
- **The deployment target is Vercel** (Nitro auto-preset). Other runtimes are a `NITRO_PRESET` away. Never hard-code a
  preset or add runtime-specific code to the app. Vercel builds only from the committed `content/` and
  `public/attachments/` (run `pnpm sync` locally, then commit).
- **Writing rules for notes live in the vault:** `../obsidian/_authoring/Writing Guide.md` (never published). When
  the content pipeline gains or changes a convention, update that guide in the same change.

## Done means

`vp check` and `vp test` are clean, `vp build` passes, and the changed pages are checked in the running app on desktop and at 375px.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

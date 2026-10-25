# Obsidian Garden

A blog that publishes my Obsidian vault (`../obsidian`).

**Stack:** TanStack Start (React 19, file-based routes, typed server functions, streaming SSR) on
[Vite+](https://viteplus.dev) (Vite 8 / Rolldown), Nitro for deployment, Tailwind CSS v4,
`motion/react`, MDX (`@mdx-js/rollup` + remark/rehype, Shiki, KaTeX), and Mermaid.

## Scripts

| Command           | What it does                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm sync`       | Copy publishable notes from `../obsidian` into `content/` and attachments into `public/attachments/` |
| `pnpm sync:watch` | The same, re-running whenever the vault changes                                                      |
| `pnpm dev`        | Dev server with HMR (`vp dev`, http://localhost:3000)                                                |
| `pnpm build`      | Production build to `.output/` (`vp build`)                                                          |
| `pnpm start`      | Run the built server (`node .output/server/index.mjs`, `PORT` defaults to 3000)                      |
| `vp check`        | Format, lint and type check                                                                          |

The build reads only the committed `content/` and `public/attachments/`. It never touches the vault,
so run `pnpm sync` and commit the result before you deploy.

## Writing notes

- **Private notes:** frontmatter `visibility: private`, `private: true`, or the tag `#private`. These
  notes are built but stay hidden unless you are an admin.
- **Never published:** frontmatter `publish: false` or `draft: true`. The sync skips these notes.
- **Private or excluded directories:** put `visibility: private` in a directory's folder note, or add
  an empty `.private` file to the directory. This applies to every subfolder and can't be overridden
  further down. A `.nopublish` file, or `publish: false` on the folder note, leaves the whole tree out
  of the sync.
- **Courses / series:** a folder becomes a course at `/series/<dir>` when it has a main note at
  `<dir>/<dir>.md`, `<dir>.md` next to the folder, or `<dir>/index.md`. Give that note `title`,
  `description` and `cover: cover.svg` in its frontmatter. Numbered filenames (`07 Foo.md`) set the
  part order.

## Environment

| Variable       | Purpose                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`     | Canonical origin for RSS, sitemap and canonical links, e.g. `https://garden.example.com`. On Vercel it falls back to `VERCEL_PROJECT_PRODUCTION_URL`. |
| `SHOW_PRIVATE` | `SHOW_PRIVATE=1 pnpm dev` lets you preview private notes. Dev only.                                                                                   |
| `NITRO_PRESET` | Deployment target used at build time (see below). Defaults to `node-server`.                                                                          |
| `PORT`         | Port for `pnpm start` (node-server preset).                                                                                                           |

## Deploy to Vercel

> [!WARNING]
> Private notes are committed under `content/_private`. They are kept out of the deployed client
> bundle, but they are in git, so **the GitHub repository must be private**.

1. Push this repo to GitHub, then **Add New -> Project** in Vercel and import it. `vercel.json`
   already sets the install command (pnpm 12 through corepack), the build command and
   `framework: null`. Nitro detects Vercel itself and writes `.vercel/output`, so nothing needs
   changing in the dashboard.
2. Optional: set the environment variable `SITE_URL`. Without it the build uses
   `VERCEL_PROJECT_PRODUCTION_URL`.
3. To publish:

   ```sh
   pnpm sync && git add content public/attachments && git commit -m "sync vault" && git push
   ```

## Deploy anywhere else

Nitro picks the target from `NITRO_PRESET` at build time. The app code stays the same:

```sh
pnpm build && pnpm start                         # node-server (default) -> .output/server/index.mjs
NITRO_PRESET=bun pnpm build                      # then: bun .output/server/index.mjs
NITRO_PRESET=vercel pnpm build                   # .vercel/output (auto-detected on Vercel)
NITRO_PRESET=netlify pnpm build                  # auto-detected on Netlify
NITRO_PRESET=cloudflare_module pnpm build        # then: npx wrangler deploy
```

For the full list of presets, see https://nitro.build/deploy.

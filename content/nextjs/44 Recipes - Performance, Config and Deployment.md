---
description: Fixes for the performance, configuration and deployment problems Next.js 16 developers hit most, from oversized client bundles and frozen NEXT_PUBLIC_ values to stale caches across pods and "Failed to find Server Action" after a deploy.
tags: [nextjs, nextjs-course, recipes, performance, deployment]
next-version: 16.4.3
aliases: [Deployment Recipes, Performance Recipes]
created: 2026-10-25T19:57:56.435Z
---

# Recipes - Performance, Config and Deployment

> [!summary] TL;DR
> Most production surprises in Next.js 16 come from things that are decided at **build time** and then frozen: `NEXT_PUBLIC_` values are inlined into the bundle, `next.config` is serialized into the standalone `server.js`, the bundler defaults to Turbopack, and the Server Action encryption key is generated per build. The rest come from **per-process state** that self-hosting multiplies: the default ISR and `'use cache'` stores are in memory, so each pod has its own copy. Use `next analyze` to find what bloats the client, `remotePatterns` for remote images, `next/font/local` for offline builds, `output: 'standalone'` plus two `cp` commands for Docker, and `cacheHandler`, `cacheHandlers`, `deploymentId` and `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for more than one instance. The Edge runtime is deprecated in 16.4, and `proxy.ts` always runs on Node.js.

Every recipe follows the same shape: **Symptom** (what you see, with the exact message where there is one), **Why** (what the framework does, with a source link to Next.js v16.4.3), **Fix**, and a pointer to the part that explains the mechanism.

## My client bundle is huge and I do not know what pulls it in

**Symptom.** Lighthouse flags a large "unused JavaScript" number, the first load on a route is several hundred kilobytes, and nothing in the build output tells you which import is responsible.

**Why.** A Client Component ships its whole import graph to the browser. One `'use client'` at the top of a layout or a page, or one provider file that imports a chart library, pulls every module below it into the client bundle, including code that only formats data. Since 16.1 the CLI has a dedicated command for this question: `next analyze` (alias `next experimental-analyze`) builds the Turbopack module graph and serves an interactive treemap without producing an application build. It is "Only compatible with Turbopack", and it can save named snapshots so you can diff before and after.[^analyze]

**Fix.** Run the analyzer, filter by route and by the client environment, then click the biggest rectangle to see its full import chain.

```bash
# Interactive UI in the browser
pnpm next analyze

# Save to .next/diagnostics/analyze for sharing or diffing
pnpm next analyze --output --snapshot before
# ...refactor...
pnpm next analyze --output --snapshot after
pnpm next analyze export --snapshot after > bundle-graph.jsonl   # 16.4+: JSON Lines for scripts
```

The import chain usually ends at one of three places, and each has a fix:

| Chain ends at | Fix |
| --- | --- |
| `'use client'` on a layout or page | Move the directive down to the smallest interactive leaf; keep the page a Server Component |
| A provider in `app/layout.tsx` that imports a heavy SDK | Lazy-load the SDK inside the provider, or mount the provider only in the route group that needs it |
| A data-to-markup library (markdown, syntax highlighting, date formatting) | Run it in a Server Component and send only the markup (next recipe) |

If you still build with webpack (`--webpack`), the analyzer is the `@next/bundle-analyzer` plugin with `ANALYZE=true pnpm build` instead.

**Deep dive:** [[02 Server and Client Components|Server and Client Components]].

## Syntax highlighting or markdown is in my client JavaScript

**Symptom.** The analyzer shows `prismjs`, `shiki`, `marked` or a charting library in the client bundle of a page whose output is just static HTML.

**Why.** The library is imported from a file that is (or is imported by) a `'use client'` module, so it is bundled for the browser and executed there even though nothing about its output is interactive. Server Components run only on the server and send the rendered result in the RSC payload, so a library used there never reaches the browser.

**Fix.** Do the transformation on the server and pass markup or plain data across the boundary.

```tsx
// app/blog/[slug]/page.tsx  (Server Component: no 'use client')
import { codeToHtml } from 'shiki'
import { CopyButton } from './copy-button' // small 'use client' leaf

export default async function Page({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  const source = await getSnippet(slug)
  const html = await codeToHtml(source, { lang: 'tsx', theme: 'github-dark' })

  return (
    <figure>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <CopyButton text={source} />
    </figure>
  )
}
```

When the heavy code really is interactive (a map, a rich text editor), load it on demand so it is not in the initial chunk:

```tsx
// app/dashboard/map-panel.tsx
'use client'
import dynamic from 'next/dynamic'

const Map = dynamic(() => import('./map'), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse rounded bg-muted" />,
})

export function MapPanel() {
  return <Map />
}
```

> [!warning] `ssr: false` belongs in a Client Component
> In a Server Component, `dynamic(..., { ssr: false })` fails to compile with "`ssr: false` is not allowed with `next/dynamic` in Server Components. Please move it into a Client Component."[^ssr-false] Put it in a small `'use client'` wrapper as above. See [[24 CSR - Client-Rendered Islands|CSR islands]] for the full pattern.

**Deep dive:** [[02 Server and Client Components|Server and Client Components]] and [[24 CSR - Client-Rendered Islands|CSR - Client-Rendered Islands]].

## Importing one icon pulls in the whole icon library

**Symptom.** `import { Check } from 'some-icons'` adds hundreds of kilobytes, or dev compile of a single page takes many seconds because thousands of modules are processed.

**Why.** Icon and utility libraries usually expose a barrel file that re-exports every module. Without help, the bundler has to parse the whole barrel to know whether any re-export has side effects. Next.js rewrites named imports from listed packages into direct per-module imports. The list is `experimental.optimizePackageImports`, and Next.js merges your entries with a long built-in list that already includes `lucide-react`, `date-fns`, `lodash-es`, `@headlessui/react`, `@heroicons/react/*`, `@mui/material`, the `react-icons/*` sets and more.[^opi] The local-development guide adds that Turbopack analyzes imports automatically and does not need this option.

**Fix.** Check whether the package is already in the built-in list; if not, add it. For libraries that ship many icon sets, import from the per-icon path the library documents and stick to one set.

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['@acme/icons', '@acme/ui'],
  },
}

export default nextConfig
```

```tsx
// Instead of the barrel
import { TriangleIcon } from '@phosphor-icons/react'
// import the single module
import { TriangleIcon } from '@phosphor-icons/react/dist/csr/Triangle'
```

**Deep dive:** [[11 Configuration, Turbopack and Deployment#The 16.x config surface|Configuration, Turbopack and Deployment]].

## NEXT_PUBLIC_API_URL has the wrong value in production

**Symptom.** You build one Docker image and promote it from staging to production with a different `NEXT_PUBLIC_API_URL`, but the browser still calls the staging URL. Or the value is `undefined` in the browser when you read it as `process.env[name]`.

**Why.** `NEXT_PUBLIC_` variables are not read at runtime in the browser. During the build, Next.js collects every key in `process.env` that starts with `NEXT_PUBLIC_` and turns it into a compile-time replacement of the exact expression `process.env.NEXT_PUBLIC_X`.[^public-env] Those replacements are part of the define table the bundler gets, alongside `env` from `next.config`.[^define-env] Two consequences follow. The value is whatever the environment held when `next build` ran, so changing it on the running container does nothing. And only the literal member expression is replaced, so `process.env[name]` or destructuring `const { NEXT_PUBLIC_X } = process.env` is left alone and is `undefined` in the browser.

**Fix.** Either rebuild per environment (simplest), or keep the variable private and read it on the server at request time, then hand it to the client as a prop.

```tsx
// app/layout.tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { ConfigProvider } from './config-provider' // 'use client' context

async function RuntimeConfig({ children }: { children: React.ReactNode }) {
  await connection() // opt out of prerendering: read env per request
  return (
    <ConfigProvider apiUrl={process.env.API_URL!}>{children}</ConfigProvider>
  )
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        <Suspense>
          <RuntimeConfig>{children}</RuntimeConfig>
        </Suspense>
      </body>
    </html>
  )
}
```

> [!tip] Narrower is better
> Wrapping the whole app in a request-time component makes every route dynamic. If only a few components need the value, read it in those Server Components (or in a Route Handler the client fetches once) and keep the rest of the tree prerendered.

| Variable | Where it is read | When it is fixed |
| --- | --- | --- |
| `NEXT_PUBLIC_X` in any code | Inlined by the bundler | At `next build` |
| `env: { X }` in `next.config` | Inlined by the bundler | At `next build` |
| `process.env.X` in a Server Component during prerender | Node.js at build | At `next build` (baked into the static HTML) |
| `process.env.X` after `await connection()` or another request-time API | Node.js per request | At runtime |

**Deep dive:** [[11 Configuration, Turbopack and Deployment#Environment variables: build time vs runtime|Configuration, Turbopack and Deployment]].

## "hostname is not configured under images in your next.config.js"

**Symptom.** In development the page crashes with:

```text
Invalid src prop (https://cdn.example.com/a.jpg) on `next/image`, hostname "cdn.example.com" is not configured under images in your `next.config.js`
See more info: https://nextjs.org/docs/messages/next-image-unconfigured-host
```

In production the image is broken instead, and its `/_next/image?url=...` request returns `400` with the body `"url" parameter is not allowed`.

**Why.** The default loader checks every absolute `src` against `images.domains` and `images.remotePatterns` and throws the message above when nothing matches.[^img-loader] The image optimizer route runs the same `hasRemoteMatch` check on the server and rejects the URL with the 400.[^img-validate] The default for `remotePatterns` is an empty array: no remote image is allowed until you list it.[^img-defaults] Also note that a `fill` image without `sizes` downloads a viewport-wide file; see [[09 Metadata, Images, Fonts and Scripts|next/image]].

There is a second cause of the same 400 that catches self-hosters. Even when the host matches, the optimizer resolves the hostname and refuses to fetch it if any address is private (localhost, `10.x`, a Docker network). It logs `upstream image ... hostname resolved to private IP` and returns the same `"url" parameter is not allowed`.[^img-private]

**Fix.** List the hosts with a pattern that is as narrow as you can make it.

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      new URL('https://cdn.example.com/uploads/**'),
      { protocol: 'https', hostname: '**.amazonaws.com', pathname: '/my-bucket/**' },
    ],
    // Only if the images really come from a private network and you accept the SSRF risk:
    // dangerouslyAllowLocalIP: true,
  },
}

export default nextConfig
```

> [!note] Other image defaults that changed in 16
> The defaults in 16.4.3 are `qualities: [75]` (any other `quality` prop is snapped to the nearest allowed value), `minimumCacheTTL: 14400` (4 hours), `maximumRedirects: 3`, and `localPatterns` unset.[^img-defaults] If you pass `quality={90}`, add `90` to `images.qualities`. A local `src` with a query string (`/og.png?v=2`) needs a matching `localPatterns` entry with `search`.

**Deep dive:** [[09 Metadata, Images, Fonts and Scripts|Metadata, Images, Fonts and Scripts]].

## The build fails in CI with "Failed to fetch `Inter` from Google Fonts."

**Symptom.** `next build` works on your laptop but fails in a sandboxed CI runner or a Docker build stage without internet:

```text
Failed to fetch font `Inter`: https://fonts.googleapis.com/css2?family=Inter...
Please check your network connection.
...
Failed to fetch `Inter` from Google Fonts.
```

**Why.** `next/font/google` self-hosts fonts by downloading them **at build time**. The loader fetches the CSS from Google Fonts with three retries, then downloads each font file and emits it into `.next/static/media`. If the CSS or a file cannot be fetched, the loader raises a build error.[^font-loader][^font-fetch] Nothing is fetched by the browser at runtime, which is the whole point, but the build needs the network.

**Fix.** Give the build stage network access, or ship the font files in the repo and use `next/font/local`, which never touches the network.

```ts
// app/fonts.ts
import localFont from 'next/font/local'

export const inter = localFont({
  src: [
    { path: './fonts/Inter-Variable.woff2', style: 'normal' },
    { path: './fonts/Inter-Italic-Variable.woff2', style: 'italic' },
  ],
  variable: '--font-sans',
  display: 'swap',
})
```

```tsx
// app/layout.tsx
import { inter } from './fonts'

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
```

A related compile error, `Font loaders must be called and assigned to a const in the module scope`, comes from the SWC transform that finds font loader calls.[^font-scope] Call `localFont()` or `Inter()` once at the top level of a module (a shared `fonts.ts` is the usual place) and import the result; do not call it inside a component.

**Deep dive:** [[09 Metadata, Images, Fonts and Scripts|Metadata, Images, Fonts and Scripts]].

## The build exits with "This build is using Turbopack, with a `webpack` config"

**Symptom.** After upgrading to 16, `next build` or `next dev` stops immediately:

```text
ERROR: This build is using Turbopack, with a `webpack` config and no `turbopack` config.
   This may be a mistake.

   As of Next.js 16 Turbopack is enabled by default and
   custom webpack configurations may need to be migrated to Turbopack.
```

**Why.** When you pass no bundler flag, `parseBundlerArgs` sets `TURBOPACK=auto` and returns Turbopack: the default bundler for both `dev` and `build` is Turbopack.[^bundler-default] When the bundler was picked by default (the `auto` value) and the config has a `webpack` function but no `turbopack` key, Next.js assumes your webpack customisation would be silently ignored and exits with status 1.[^turbo-warning] The `webpack` key is often added by a plugin wrapper (`withSentryConfig`, `withMDX`, an analyzer), not by you.

**Fix.** Pick one of three, in this order of preference.

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 1. The app works without the webpack tweak: tell Next.js you checked.
  turbopack: {},
  // 2. Or port the tweak, e.g. an SVG loader:
  // turbopack: {
  //   rules: { '*.svg': { loaders: ['@svgr/webpack'], as: '*.js' } },
  // },
}

export default nextConfig
```

```json
// package.json  (3. stay on webpack for now)
{
  "scripts": {
    "dev": "next dev --webpack",
    "build": "next build --webpack"
  }
}
```

**Deep dive:** [[11 Configuration, Turbopack and Deployment#Turbopack is the default bundler|Configuration, Turbopack and Deployment]].

## Dev is slow, and the dev server uses gigabytes of memory

**Symptom.** The first visit to each route takes many seconds to compile, HMR lags, or the Node.js process grows until it is killed.

**Why.** Turbopack is the default dev bundler, and in 16.4.3 its file-system cache is on by default for both dev and build (`experimental.turbopackFileSystemCacheForDev` and `ForBuild` are `true`), so a restart reuses previous work from `.next/dev/cache/turbopack`.[^fs-cache] When dev is still slow, the cause is almost always outside the bundler: barrel imports that force thousands of modules through the compiler (see the icon recipe), a Tailwind v3 `content` glob that reaches into `node_modules`, a custom webpack config that forces `--webpack`, antivirus scanning `.next`, or Docker bind mounts on macOS and Windows.

**Fix.** Work down this list and measure after each step.

1. Make sure no flag or env var forces webpack (`--webpack`, `IS_WEBPACK_TEST`). Drop custom webpack config from dev if it is only needed for production.
2. Fix barrel imports (previous recipes) and narrow Tailwind's `content` globs to your own source folders.
3. Run `next dev` on the host, not inside a Docker bind mount, on macOS and Windows. On Windows use a Dev Drive or WSL 2.
4. Exclude the project folder from antivirus real-time scanning.
5. If a slow route stays slow, record a trace and look at it rather than guessing:

```bash
pnpm next dev --internal-trace
# reproduce the slow route, stop the server, then open the trace viewer:
pnpm next internal trace .next-profiles/trace-turbopack.bin
```

For **build** memory under webpack, `experimental.webpackMemoryOptimizations: true` and `next build --experimental-debug-memory-usage` are the documented levers; a heap profile with `node --heap-prof node_modules/next/dist/bin/next build` shows what is retained.

**Deep dive:** [[11 Configuration, Turbopack and Deployment#Turbopack is the default bundler|Configuration, Turbopack and Deployment]].

## My Docker image is 1 GB, or the standalone server has no CSS and no images

**Symptom.** The production image copies the whole `node_modules`. Or, after switching to `output: 'standalone'`, `node server.js` serves HTML with no styles, `/_next/static/*` returns 404, and files from `public/` are missing. Or the container starts but nothing answers on the port.

**Why.** With `output: 'standalone'`, the build traces which files each route actually loads and copies only those into `.next/standalone`, together with a minimal `server.js`.[^standalone] It deliberately does **not** copy `public` or `.next/static`; those are meant for a CDN, and you copy them yourself if the Node server should serve them. The generated `server.js` reads `PORT` (default `3000`) and `HOSTNAME` (default `0.0.0.0`) and inlines your resolved `next.config` as JSON, so config changes need a rebuild.[^server-js] Docker sets `HOSTNAME` to the container ID, so the server can bind to an interface you are not publishing.

**Fix.**

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
}

export default nextConfig
```

```dockerfile
# Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm next build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

> [!warning] Streaming behind nginx
> If a reverse proxy buffers responses, `loading.tsx`, `<Suspense>` streaming and PPR all arrive in one piece at the end. For nginx, send `X-Accel-Buffering: no` (via `headers()` in `next.config`) or turn off `proxy_buffering`, and check that the load balancer passes chunked responses through.

**Deep dive:** [[11 Configuration, Turbopack and Deployment#Shipping it: four ways|Configuration, Turbopack and Deployment]].

## ISR pages and "use cache" data are stale on some pods but not others

**Symptom.** You run three replicas. After `revalidateTag('posts')` one replica shows the new post and the others keep serving the old page until they restart or their own revalidation window passes.

**Why.** There are two caches, and both are per process by default.

- The incremental cache (ISR pages, route handler responses, the legacy `fetch` cache) is in memory (50 MB by default) plus local disk. A custom store plugs in through `cacheHandler`, a class with `get`, `set`, `revalidateTag` and `resetRequestCache`.[^cache-handler-class]
- The `'use cache'` store uses `cacheHandlers`. Its `default`, `remote` and `static` slots can also be set by `NEXT_DEFAULT_CACHE_HANDLER_PATH`, `NEXT_REMOTE_CACHE_HANDLER_PATH` and `NEXT_STATIC_CACHE_HANDLER_PATH`.[^cache-handlers-config] When nothing is configured, Next.js creates one in-memory LRU handler and registers it for **both** `default` and `remote`.[^use-cache-init] So `'use cache: remote'` is not remote at all when you self-host without a handler. See [[23 PPR - Partial Prerendering with Cache Components#The prelude and the postponed state|PPR]] for why a shell and its postponed state (with the resume data cache) are stored as a pair.

A `revalidateTag` call reaches only the handler of the instance that ran it. For `'use cache'` the handler interface has `refreshTags()`, called once per request before the first read, and `updateTags()`, called on invalidation. Those two methods are where cross-instance coordination goes.[^use-cache-iface]

**Fix.** Point both caches at shared storage and turn off the in-process copy.

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheHandler: require.resolve('./cache/isr-redis.mjs'), // ISR and route caches
  cacheMaxMemorySize: 0, // no per-pod in-memory copy
  cacheHandlers: {
    default: require.resolve('./cache/use-cache-redis.mjs'),
    remote: require.resolve('./cache/use-cache-redis.mjs'),
  },
}

export default nextConfig
```

```ts
// cache/use-cache-redis.mjs  (shape only: see the Redis example for a full one)
const handler = {
  async get(cacheKey, softTags) { /* read entry, compare tag timestamps */ },
  async set(cacheKey, pendingEntry) { /* await entry, store bytes with a TTL from expire */ },
  async refreshTags() { /* pull tag -> timestamp map from Redis into memory */ },
  async getExpiration(tags) { /* max revalidation timestamp for these tags */ },
  async updateTags(tags, durations) { /* write timestamps, publish to other pods */ },
}
export default handler
```

> [!warning] Serialize properly
> Entries contain `Buffer` and `Map` values. Storing them with plain `JSON.stringify` produces errors such as `segmentData.get is not a function` on client navigations. The handler also owns eviction: Next.js never deletes entries, so set a TTL or an LRU bound.

**Deep dive:** [[05 Cache Components - use cache, cacheLife and cacheTag|Cache Components]], [[06 Revalidation - Tags, Paths and Refresh|Revalidation]] and [[21 SSG and ISR - Static Pages and generateStaticParams|SSG and ISR]].

## "Failed to find Server Action" right after a deploy

**Symptom.** During or after a rolling deploy, form submissions fail and the server logs:

```text
Failed to find Server Action "7f3a...". This request might be from an older or newer deployment.
Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
```

Sometimes navigations also 404 on old chunk URLs, or closures bound into actions fail to decrypt on a different replica.

**Why.** Three build-scoped values must line up between the browser tab and the server that handles the request.

1. **Action IDs.** A tab loaded from build A posts an action ID that build B may not have. The server reports the error above.[^action-not-found]
2. **The encryption key** for closed-over action arguments. Each build generates a fresh AES-GCM key unless `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is set at build time.[^enc-key] Two replicas built separately cannot decrypt each other's payloads.
3. **Navigation payloads and assets.** When a `deploymentId` is configured, the client sends it as `x-deployment-id` on every RSC request.[^dpl-header] If the server's build ID in the response does not match the client's, the router gives up on the soft navigation and does a full page load instead.[^dpl-mpa]

**Fix.** Build once and run the same artifact on every replica. Then set the values that make builds agree.

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Same value for every replica of one release; changes per release.
  deploymentId: process.env.GIT_SHA,
}

export default nextConfig
```

```bash
# Generate once, store as a secret, use for every build of this app
openssl rand -base64 32
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=... GIT_SHA=$(git rev-parse HEAD) pnpm next build
```

Keep the old release's static assets available for a while (or serve `/_next/static` from a bucket you only ever add to), so open tabs can still load their chunks until the hard reload moves them to the new build.

**Deep dive:** [[07 Server Actions and Forms|Server Actions and Forms]], [[43 Recipes - Forms, Mutations and Uploads#"Failed to find Server Action" after a deploy|Recipes: Forms]] and [[11 Configuration, Turbopack and Deployment|Configuration, Turbopack and Deployment]].

## Should I still use the Edge runtime?

**Symptom.** The build prints:

```text
The Edge Runtime is deprecated. You can use the "nodejs" runtime instead. Learn more: https://nextjs.org/docs/messages/edge-runtime-deprecated
```

Or a `proxy.ts` with `export const config = { runtime: 'edge' }` fails the build with:

```text
Route segment config is not allowed in Proxy file at "./proxy.ts". Proxy always runs on Node.js runtime. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
```

**Why.** In 16.4.3 any route that exports `runtime = 'edge'` triggers the deprecation warning during page analysis.[^edge-warn][^edge-warn-src] `proxy.ts` (the renamed `middleware.ts`) does not accept a `runtime` at all: in dev Next.js logs the message once and forces Node.js, in a build it throws.[^proxy-runtime] With `cacheComponents` enabled, the docs also ask you to remove every `runtime` export, including `runtime = 'nodejs'`, because Cache Components only runs on the default Node.js runtime.

**Fix.** Delete the export. Node.js is the default, so nothing replaces it.

```diff
// app/api/og/route.ts
- export const runtime = 'edge'
  export async function GET(request: Request) {
    // full Node.js APIs available: fs, crypto, native drivers
  }
```

If you used the Edge runtime for low latency, put the latency-sensitive check in `proxy.ts` (which your platform may still run close to the user) and keep pages on Node.js. If you used it to avoid cold starts, measure again on Node.js first; the standalone server and modern serverless runtimes are usually fast enough.

**Deep dive:** [[08 Route Handlers and Proxy|Route Handlers and Proxy]].

## A short pre-launch checklist

These are the items from the recipes above that are cheap to check before the first production deploy.

- [ ] `next analyze` run once; no data-only library in a client chunk.
- [ ] No `NEXT_PUBLIC_` variable that is expected to change after the build.
- [ ] `images.remotePatterns` narrow, `qualities` lists every `quality` you pass.
- [ ] Fonts via `next/font` (local files if the build has no network).
- [ ] `turbopack: {}` or a port of your webpack tweaks; no accidental `--webpack`.
- [ ] Docker: `output: 'standalone'`, `public` and `.next/static` copied, `HOSTNAME=0.0.0.0`.
- [ ] More than one instance: shared `cacheHandler`/`cacheHandlers`, `cacheMaxMemorySize: 0`, `deploymentId`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
- [ ] No `runtime = 'edge'` exports; nothing in `proxy.ts`'s `config` but `matcher`.
- [ ] Reverse proxy does not buffer streamed responses.

## Summary

Performance and deployment problems in Next.js 16 sort into two families. Build-time decisions get frozen into the artifact: the bundler (Turbopack unless you say otherwise), the `NEXT_PUBLIC_` values, the downloaded fonts, the serialized config in `server.js`, and the action encryption key. Per-process state gets multiplied when you self-host: the ISR store and the `'use cache'` store are in memory, so each pod sees its own world until you plug in shared handlers. Find bundle weight with `next analyze` and move data-only work to Server Components; fix deployments by building once, copying the static folders, and giving every replica the same cache, deployment ID and key. This closes the course; the [[00 Next.js in Practice Index|Index]] links back to every feature and pattern part.

### Key takeaways

- **`next analyze`**: the Turbopack bundle analyzer (16.1+) shows the import chain behind every large client module; snapshots and `export` (16.4+) let you diff.
- **Server-side transformation**: highlighting, markdown and formatting belong in Server Components, so only markup crosses the boundary.
- **`optimizePackageImports`**: Next.js already rewrites barrel imports for a long built-in list of icon and utility packages; add yours only if missing.
- **`NEXT_PUBLIC_`**: replaced literally at build time; dynamic lookups are not replaced; runtime values must be read on the server after a request-time API.
- **`remotePatterns`**: empty by default; unmatched hosts throw in dev and return a 400 in production, and private IPs are refused unless `dangerouslyAllowLocalIP` is set.
- **`next/font/google`**: downloads at build time, so offline builds need `next/font/local`.
- **Turbopack default**: a defaulted Turbopack build with only a `webpack` config exits; add `turbopack: {}`, port the rule, or pass `--webpack`.
- **Standalone output**: copy `public` and `.next/static` yourself and set `HOSTNAME=0.0.0.0` in Docker.
- **Multi-instance**: shared `cacheHandler` and `cacheHandlers`, `cacheMaxMemorySize: 0`, `deploymentId` and a fixed `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`; `'use cache: remote'` is in-memory when self-hosted without a handler.
- **Edge runtime**: deprecated in 16.4; `proxy.ts` always runs on Node.js and rejects a `runtime` config.

← [[43 Recipes - Forms, Mutations and Uploads|Recipes: Forms]] · [[00 Next.js in Practice Index|Index]]

[^analyze]: `next analyze` command (alias `experimental-analyze`, "Only compatible with Turbopack") — [packages/next/src/bin/next.ts#L281-L300](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/bin/next.ts#L281-L300); usage guide: [Package Bundling](https://nextjs.org/docs/app/guides/package-bundling)
[^ssr-false]: RSC transform rejects `ssr: false` in the server graph — [crates/next-custom-transforms/src/transforms/react_server_components.rs#L378](https://github.com/vercel/next.js/blob/v16.4.3/crates/next-custom-transforms/src/transforms/react_server_components.rs#L378)
[^opi]: built-in `optimizePackageImports` list merged with the user list — [packages/next/src/server/config.ts#L1605-L1691](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/server/config.ts#L1605-L1691)
[^public-env]: `getNextPublicEnvironmentVariables` — [packages/next/src/lib/static-env.ts#L20-L35](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/lib/static-env.ts#L20-L35)
[^define-env]: `getDefineEnv` collects public and config env for the bundler — [packages/next/src/build/define-env.ts#L106-L126](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/build/define-env.ts#L106-L126)
[^img-loader]: default image loader remote host check and error — [packages/next/src/shared/lib/image-loader.ts#L103-L119](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/shared/lib/image-loader.ts#L103-L119)
[^img-validate]: `ImageOptimizerCache.validateParams` remote check — [packages/next/src/server/image-optimizer.ts#L252-L254](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/server/image-optimizer.ts#L252-L254)
[^img-defaults]: `imageConfigDefault` — [packages/next/src/shared/lib/image-config.ts#L237-L262](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/shared/lib/image-config.ts#L237-L262)
[^img-private]: `fetchExternalImage` private IP refusal — [packages/next/src/server/image-optimizer.ts#L815-L827](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/server/image-optimizer.ts#L815-L827)
[^font-loader]: Google font loader fetch and `Failed to fetch ... from Google Fonts.` — [packages/font/src/google/loader.ts#L74-L95](https://github.com/vercel/next.js/blob/v16.4.3/packages/font/src/google/loader.ts#L74-L95)
[^font-fetch]: `fetchCSSFromGoogleFonts` with three retries — [packages/font/src/google/fetch-css-from-google-fonts.ts#L12-L36](https://github.com/vercel/next.js/blob/v16.4.3/packages/font/src/google/fetch-css-from-google-fonts.ts#L12-L36)
[^font-scope]: font loader module-scope check — [crates/next-custom-transforms/src/transforms/fonts/find_functions_outside_module_scope.rs#L22-L29](https://github.com/vercel/next.js/blob/v16.4.3/crates/next-custom-transforms/src/transforms/fonts/find_functions_outside_module_scope.rs#L22-L29)
[^bundler-default]: `parseBundlerArgs` defaults to Turbopack — [packages/next/src/lib/bundler.ts#L99-L103](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/lib/bundler.ts#L99-L103)
[^turbo-warning]: webpack-config-without-turbopack exit — [packages/next/src/lib/turbopack-warning.ts#L143-L166](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/lib/turbopack-warning.ts#L143-L166)
[^fs-cache]: `turbopackFileSystemCacheForDev` / `ForBuild` defaults — [packages/next/src/server/config-shared.ts#L2494-L2495](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/server/config-shared.ts#L2494-L2495)
[^standalone]: `writeStandaloneDirectory` — [packages/next/src/build/index.ts#L852-L977](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/build/index.ts#L852-L977); docs: [output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
[^server-js]: generated standalone `server.js` (`PORT`, `HOSTNAME`, inlined config) — [packages/next/src/build/utils.ts#L1609-L1640](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/build/utils.ts#L1609-L1640)
[^cache-handler-class]: incremental `CacheHandler` base class — [packages/next/src/server/lib/incremental-cache/index.ts#L113-L142](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/server/lib/incremental-cache/index.ts#L113-L142); guide: [Self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
[^cache-handlers-config]: `cacheHandlers` defaults from env — [packages/next/src/server/config-shared.ts#L2383-L2387](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/server/config-shared.ts#L2383-L2387)
[^use-cache-init]: `initializeCacheHandlers` aliases `remote` to the in-memory default — [packages/next/src/server/use-cache/handlers.ts#L85-L114](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/server/use-cache/handlers.ts#L85-L114)
[^use-cache-iface]: `'use cache'` `CacheHandler` interface (`refreshTags`, `updateTags`) — [packages/next/src/server/lib/cache-handlers/types.ts#L68-L117](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/server/lib/cache-handlers/types.ts#L68-L117)
[^action-not-found]: `getActionNotFoundError` — [packages/next/src/server/app-render/manifests-singleton.ts#L25-L29](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/server/app-render/manifests-singleton.ts#L25-L29)
[^enc-key]: `generateEncryptionKeyBase64` — [packages/next/src/server/app-render/encryption-utils-server.ts#L97-L129](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/server/app-render/encryption-utils-server.ts#L97-L129)
[^dpl-header]: `x-deployment-id` request header — [packages/next/src/client/components/router-reducer/fetch-server-response.ts#L733-L736](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/client/components/router-reducer/fetch-server-response.ts#L733-L736)
[^dpl-mpa]: build mismatch falls back to MPA navigation — [packages/next/src/client/components/router-reducer/fetch-server-response.ts#L259-L265](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/client/components/router-reducer/fetch-server-response.ts#L259-L265)
[^edge-warn]: `warnAboutEdgeRuntime` — [packages/next/src/build/warn-about-edge-runtime.ts#L3-L12](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/build/warn-about-edge-runtime.ts#L3-L12)
[^edge-warn-src]: app page analysis calls the warning for `runtime = 'edge'` — [packages/next/src/build/analysis/get-page-static-info.ts#L781-L783](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/build/analysis/get-page-static-info.ts#L781-L783)
[^proxy-runtime]: Proxy rejects segment config, always Node.js — [packages/next/src/build/analysis/get-page-static-info.ts#L857-L874](https://github.com/vercel/next.js/blob/v16.4.3/packages/next/src/build/analysis/get-page-static-info.ts#L857-L874)

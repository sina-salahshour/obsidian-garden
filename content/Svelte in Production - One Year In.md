---
title: A Year of Svelte 5 in Production, From a React Developer
description: "After 5+ years of React, I spent a year building an ERP with SvelteKit and Svelte 5. What was a joy, what hurt, and why I would still pick React today."
date: 2026-11-10
tags: [svelte, react, sveltekit, tanstack-query, retrospective]
cover: svelte-vs-react.svg
---

# A Year of Svelte 5 in Production, From a React Developer

> [!summary] TL;DR
> I wrote React for more than five years, then spent a year building an ERP on SvelteKit and Svelte 5. Runes made
> day-to-day state work genuinely easier: no dependency arrays, no wasted re-renders, shared state that is just a
> variable, and transitions in the box. But Svelte gives you a lot of freedom and very few guardrails, its HMR was
> weaker than React's, and the ecosystem is thinner. For a serious, long-lived project I would pick React again,
> at least for now.

## The project

We built an ERP: sales, leads and deals, inventory, accounting, workforce. Our infrastructure team provided a
backend with generic data APIs, and we used **SvelteKit as the full-stack layer** on top of it: the domain services
(what a "deal" is, how a lead becomes one) lived on the SvelteKit side, and the browser talked to those.

It was not a toy. Over about eleven months the main app grew to more than 1,100 `.svelte` files and over 3,000
commits, with a custom UI library, a custom toast system, RTL and Persian (Jalali) dates throughout.

The stack, for the curious:

- **Svelte 5 with runes from day one**, SvelteKit 2 on `adapter-node`, hosted on our own servers
- **TanStack Query** for server state, caching and optimistic updates
- Tailwind CSS 4, and our own component library built on Floating UI
- oRPC for typed calls between the browser and the SvelteKit server, zod for validation

This was my first Svelte project. Everything below is written from the point of view of someone whose instincts
were shaped by React.

## Why we picked Svelte

The pitch was ease of use, speed and bundle size. What sold me personally was the reactivity model. Global state,
context and "keep this in sync with that" are the parts of a React codebase that tend to get complicated, and
Svelte 5 promised to make them boring.

I expected a painful adjustment. There wasn't one. The core ideas map one to one: state, derived values, effects,
props, context. If you understand React, you already understand Svelte; you just type less.

## What Svelte got right

### Reactivity without dependency arrays

This is the headline, and it lived up to it. In React, a derived value and an effect look like this:

```tsx
const [query, setQuery] = useState("");
const visible = useMemo(() => leads.filter((l) => l.name.includes(query)), [leads, query]);

useEffect(() => {
  analytics.track("lead-search", { query, results: visible.length });
}, [query, visible.length]);
```

In Svelte 5:

```svelte
<script lang="ts">
  let { leads } = $props();
  let query = $state("");
  const visible = $derived(leads.filter((l) => l.name.includes(query)));

  $effect(() => {
    analytics.track("lead-search", { query, results: visible.length });
  });
</script>
```

There is no dependency array to get wrong, because Svelte tracks what you actually read. There is no `useCallback`
dance to keep a child from re-rendering, because components do not re-render: when `query` changes, Svelte updates
the exact DOM nodes that depend on it and nothing else. A whole category of React bugs (stale closures, effects
firing too often, memoisation that silently stops working) simply did not show up.

### Shared state is just a variable

In React, state shared across the app means a context provider, a reducer or an external store library. In
Svelte 5 it is a `.svelte.ts` module:

```ts
// store/tenant.svelte.ts
export const activeTenant = $state<{ current: Tenant | null }>({ current: null });
```

Any component can read `activeTenant.current` in its markup and stay in sync, and any code can assign to it. (The
`.current` wrapper is there because a module cannot export a `$state` variable that gets reassigned; mutating a
property of an exported object is fine.)

Small utilities fall out of this almost for free. Our localStorage-backed state is a handful of lines:

```ts
import { untrack } from "svelte";

export function persisted<T>(key: string, initial: T) {
  const state = $state({ current: initial });
  // effects never run during SSR, so localStorage is only touched in the browser
  $effect.root(() => {
    $effect.pre(() => {
      untrack(() => {
        const saved = localStorage.getItem(key);
        if (saved) state.current = JSON.parse(saved);
      });
    });
    $effect(() => localStorage.setItem(key, JSON.stringify(state.current)));
  });
  return state;
}
```

Syncing with external stores was easier too. Anything that follows Svelte's store contract (for us, Dexie's
`liveQuery` over IndexedDB) can be read with a `$` prefix and participates in reactivity, with no
`useSyncExternalStore` plumbing.

### Motion is in the box

Svelte ships transitions and animations in the framework: `transition:`, `in:` and `out:` directives, and
`animate:flip` for reordering lists. The part I missed most in React is that **exit animations are built in**: an
element leaving an `{#if}` or an `{#each}` plays its outro before it is removed, no wrapper component required.

Our whole toast stack is essentially this:

```svelte
<script lang="ts">
  import { fly, blur } from "svelte/transition";
  import { flip } from "svelte/animate";
</script>

{#each toasts as toast (toast.id)}
  <div animate:flip={{ duration: 200 }} in:fly={{ y: 12 }} out:blur>
    {toast.title}
  </div>
{/each}
```

The API that pushes toasts is a tiny class that appends to a `$state` array. In React I would have reached for a
library.

### Small things that add up

- **State inside the template.** You can declare a reactive value right where you use it, as
  `{const total = $derived(item.price * item.quantity)}` inside an `{#each}` or `{#if}` block, instead of
  hoisting it into the script or splitting out a component.
- **Snippets** replaced most of what render props and `children` functions do in React, with less ceremony.
- **Attachments** (`{@attach}`) are a clean way to hang DOM behaviour on an element. Our infinite scroll and
  in-view detection became one-line attachments.
- **The compiler is yours to extend.** We wrote a small preprocessor that converts digits to Persian at compile
  time inside any element marked `data-locale`. That is not something you can do as neatly in React.

## What hurt

### Freedom without guardrails

This is the big one, and it took me a while to put into words. **React enforces a way of programming**: data flows
one way, state is immutable, a component is a function of its props. Those rules are sometimes annoying, but they
make a large codebase predictable. When something changes, you know it changed through a setter, and you can find
every setter.

Svelte 5 state is a **deeply reactive proxy**. Hand an object to a child and the child can reach in and change a
nested field. Make a prop `$bindable` and the child can write to the parent's state. Nothing stops you, and in a
team under deadline pressure, people take the shortcut. By the end, our main app had 407 `$bindable` props against
839 `$props()` calls: roughly one prop in two could flow *back up*. We used `$state.raw`, the opt-out that gives
you plain immutable-style values, exactly zero times.

The second symptom was effects used to keep two pieces of state in sync. This is the most common one I saw:

```svelte
<script lang="ts">
  import { untrack } from "svelte";
  let { value = $bindable() } = $props();
  let text = $state("");

  $effect(() => {
    if (text !== untrack(() => String(value))) value = Number(text);
  });
  $effect(() => {
    if (String(value) !== untrack(() => text)) text = String(value ?? "");
  });
</script>

<input bind:value={text} />
```

Two effects pushing values at each other, held apart with `untrack`. It works, until one day it doesn't: in
September we shipped a fix for a filter panel that **crashed on open because of an infinite loop in an effect**.
The same component, written the way Svelte wants:

```svelte
<script lang="ts">
  let { value = $bindable() } = $props();
</script>

<input
  bind:value={() => value?.toString() ?? "", (v) => (value = v === "" ? null : Number(v))}
/>
```

One function binding, no effects, nothing to loop. The lesson is the same one React teaches with `useEffect`:
if you are using an effect to derive or sync state, you probably want `$derived` or an event handler instead. The
difference is that React's ergonomics push you away from that mistake, and Svelte's make it very easy to make. Our
codebase ended up with 356 `$effect` calls and 97 `untrack` calls, and I would bet a good share of both should not
exist.

### HMR was weaker than I was used to

React Fast Refresh is very good at keeping state across edits. Svelte's HMR was noticeably less forgiving for us,
and one pattern broke reliably: **contexts created at module level**. We liked to keep a context next to the
component that provides it: create it with Svelte's `createContext` in the component's `<script module>` block,
export the getter and setter, and let the children import the getter straight from the `.svelte` file. Our quick
access palette, trimmed down:

```svelte
<!-- QuickAccessModal.svelte -->
<script lang="ts" module>
  import { createContext } from "svelte";

  interface QuickAccessContext {
    currentTab: string;
    handleSubmit: (action: QuickAccessAction) => void;
  }

  export const [getQuickAccessContext, setQuickAccessContext] =
    createContext<QuickAccessContext>();
</script>

<script lang="ts">
  const context: QuickAccessContext = $state({ currentTab: "all", handleSubmit });
  setQuickAccessContext(context);
</script>
```

```svelte
<!-- QuickAccessDeals.svelte -->
<script lang="ts">
  import { getQuickAccessContext } from "./QuickAccessModal.svelte";
  const context = getQuickAccessContext();
</script>
```

It reads beautifully, and it works in production. But edit `QuickAccessModal.svelte` during development and the
hot update re-runs the whole component, module script included, so `createContext` runs again and mints a new
context. As far as we could tell, the children were still holding the getter for the old one, found nothing, and
the palette broke until a full reload. Not a production problem, but a daily papercut, and the kind of thing that
makes a framework feel less mature.

### Reactivity at the seams

TanStack Query works well with Svelte 5, but you have to respect the seam. Options are passed as a function, so
Svelte can re-run them when the values they read change:

```ts
const leads = createQuery(() => ({
  queryKey: ["leads", { search: search.current }],
  queryFn: () => api.leads.list({ search: search.current }),
  enabled: !!catalog.current,
}));
```

Forget the arrow and pass a plain object, and the query reads its inputs once and never updates. That one is easy
to learn. Harder were the occasional reactivity errors where Svelte's tracking and the library's own
subscriptions met, which **we could not fully explain or fix**. More than once the honest resolution was to
restructure the code to avoid the pattern rather than understand it. We also hit at least one bug that was in
Svelte itself and went away with an upgrade.

### The ecosystem gap

This is where React's lead is largest. Some examples we felt directly:

- **Animation:** Svelte's built-in transitions cover a lot, and [Motion](https://motion.dev)'s plain JavaScript
  API works anywhere, but there is no Svelte counterpart to Motion for React's layout and shared-element
  animations.
- **Forms:** nothing with the reach of React Hook Form. Superforms is good, but it is designed around SvelteKit
  form actions and our app barely used them, so we wrote our own form helper.
- **Frameworks:** TanStack Start supports React and Solid, not Svelte. SvelteKit is good, but it is the only
  serious option.
- **UI primitives:** headless libraries exist (bits-ui, the base of shadcn-svelte, which we used in our admin
  app), but for the main app we ended up building our own components from scratch.

Often the Svelte option exists, but it is a smaller, younger version of the React one, with fewer people having
already hit your bug.

## How the architecture grew

Looking back at the history, the project's arc tells the same story as the sections above. We started with raw
runes and a few classic stores. Around month five we adopted **TanStack Query** to get caching, invalidation and
optimistic updates under control. Around month eight we added **oRPC** for typed calls into the SvelteKit server.
In month ten we wrote our own small **resource layer** on top of both: each domain declares its queries and
mutations once, and gets typed hooks, generic optimistic updates with rollback, and request batching.

Every one of those steps added structure that Svelte itself does not impose. That is not a criticism of Svelte so
much as the trade-off it makes: it hands you sharp, minimal tools and trusts you to build the conventions.

## The verdict

Svelte 5 is the most pleasant framework I have written UI in. Runes are a genuinely better model for everyday state
than hooks, the compiler makes small things delightful, and the amount of code you do not have to write adds up.

But for a **serious, long-lived project**, I would choose React again, at least for now. React is more polished and
more stable, its constraints make a big codebase easier to maintain and debug, and its ecosystem has a mature,
battle-tested answer for nearly everything. With Svelte, our biggest problems were not the framework's bugs; they
were the mistakes the framework let us make, plus the libraries we had to build ourselves.

Where would I still reach for Svelte? Smaller apps, internal tools, a team of one or two people who agree on
conventions, or anywhere bundle size and raw speed matter more than ecosystem. And I will keep watching: most of
what pushed me back to React is the kind of thing that time and adoption fix.

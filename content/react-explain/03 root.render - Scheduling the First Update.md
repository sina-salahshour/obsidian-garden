---
tags: [react, react-internals, root-render, scheduling]
aliases: [root.render]
react-version: 19.3.1
created: 2026-10-25T11:52:02.360Z
---

# root.render - Scheduling the First Update

> [!summary] TL;DR
> `root.render(<App />)` does not render. It picks a lane (normally `DefaultLane`), wraps the element in an `Update {payload: {element}}`, stashes the update in a global concurrent queue, marks the lane pending on the FiberRoot, and makes sure a **microtask** is queued. In that microtask, the root scheduler picks the lanes and, for a non-sync lane, books a Scheduler task (`performWorkOnRootViaSchedulerTask`) that runs in a later macrotask. Your `App` function first runs inside that task.

## The whole path at a glance

```mermaid
sequenceDiagram
  autonumber
  participant U as your code
  participant DR as ReactDOMRoot.render
  participant RC as updateContainer / Impl
  participant Q as concurrentQueues
  participant WL as scheduleUpdateOnFiber
  participant RS as RootScheduler
  participant MT as microtask
  participant S as Scheduler (MessageChannel)
  U->>DR: root.render(<App/>)
  DR->>RC: updateContainer(children, root, null, null)
  RC->>RC: lane = requestUpdateLane(current) => DefaultLane
  RC->>RC: update = createUpdate(lane); update.payload = {element}
  RC->>Q: enqueueUpdate(rootFiber, update, lane)
  Q-->>RC: FiberRoot (walk .return to HostRoot)
  RC->>WL: scheduleUpdateOnFiber(root, rootFiber, lane)
  WL->>WL: markRootUpdated(root, lane) — pendingLanes |= lane
  WL->>RS: ensureRootIsScheduled(root)
  RS->>MT: scheduleImmediateRootScheduleTask() => queueMicrotask
  Note over U,MT: root.render returns — nothing rendered yet
  MT->>RS: processRootScheduleInMicrotask()
  RS->>RS: scheduleTaskForRootDuringMicrotask: getNextLanes => DefaultLane
  RS->>S: scheduleCallback(NormalPriority, performWorkOnRootViaSchedulerTask)
  S->>RS: (next macrotask) performWorkOnRootViaSchedulerTask(root)
  RS->>RS: performWorkOnRoot(root, lanes, forceSync) => Work Loop
```

## 1. `ReactDOMRoot.prototype.render`

```js
function (children) {
  const root = this._internalRoot;
  if (root === null) throw new Error('Cannot update an unmounted root.');
  // DEV: warn on a 2nd argument (callback or container)
  updateContainer(children, root, null, null);
}
```

[^render] `children` can be any `ReactNodeList`: an element, a string, an array, or `null`. `root.render(null)` is a valid way to clear the tree without unmounting. `parentComponent` and `callback` are always `null` for `createRoot` roots.

## 2. `updateContainer`: pick a lane

```js
export function updateContainer(element, container, parentComponent, callback) {
  const current = container.current;          // the HostRoot fiber
  const lane = requestUpdateLane(current);
  updateContainerImpl(current, lane, element, container, parentComponent, callback);
  return lane;
}
```

[^updatecontainer] `requestUpdateLane` is the one function that decides the priority of every update in React: `setState`, `dispatch` and `root.render` alike. In order:[^requestupdatelane]

1. (legacy mode only, compiled out in 19) non-concurrent fiber → `SyncLane`.
2. **Render-phase update** (we're inside `RenderContext` with lanes in progress) → reuse a lane from the current render. The comment calls this "not officially supported".
3. **Inside a transition** (`ReactSharedInternals.T !== null`, set by `startTransition`) → `requestTransitionLane(transition)`. All transitions started in the same event share one transition lane.
4. Otherwise → `eventPriorityToLane(resolveUpdatePriority())`.

`resolveUpdatePriority` is a host-config function. For DOM:[^resolvepriority]

```js
export function resolveUpdatePriority() {
  const updatePriority = ReactDOMSharedInternals.p;     // set by React's event wrappers, flushSync, ...
  if (updatePriority !== NoEventPriority) return updatePriority;
  const currentEvent = window.event;
  if (currentEvent === undefined) return DefaultEventPriority;
  return getEventPriority(currentEvent.type);           // 'click' -> Discrete, 'mousemove' -> Continuous
}
```

For a top-level `root.render(<App />)` in a module script, no React event is in progress and `window.event` is `undefined`. So the result is `DefaultEventPriority`, which **is** `DefaultLane`: event priorities are lanes in disguise.[^eventpriorities]

> [!warning] Gotcha: the lane of the first render depends on *where* you call it
> - Top-level script → `DefaultLane`.
> - Inside a native `click` listener (even one not attached by React) → `window.event.type === 'click'` → `getEventPriority` returns `DiscreteEventPriority` → **`SyncLane`**.[^geteventpriority]
> - Inside `startTransition(() => root.render(<App/>))` → a transition lane, which is interruptible and time-sliced.
> - Inside `flushSync(() => root.render(...))` → `p` is set to Discrete → `SyncLane`, flushed before `flushSync` returns.[^flushsync]
>
> In practice `DefaultLane` and `SyncLane` both render without yielding in 19 (see below), so the visible difference is *when* the render starts: at the end of the current microtask checkpoint for Sync, or in a later Scheduler macrotask for Default.

## 3. `updateContainerImpl`: build and enqueue the update

```js
// packages/react-reconciler/src/ReactFiberReconciler.js (simplified)
function updateContainerImpl(rootFiber, lane, element, container, parentComponent, callback) {
  const context = getContextForSubtree(parentComponent);  // emptyContextObject for createRoot
  if (container.context === null) container.context = context;
  else container.pendingContext = context;

  const update = createUpdate(lane);
  // Caution: React DevTools currently depends on this property being called "element".
  update.payload = {element};
  if (callback !== null) update.callback = callback;

  const root = enqueueUpdate(rootFiber, update, lane);
  if (root !== null) {
    startUpdateTimerByLane(lane, 'root.render()', null);
    scheduleUpdateOnFiber(root, rootFiber, lane);
    entangleTransitions(root, rootFiber, lane);
  }
}
```

[^updatecontainerimpl] `createUpdate` makes a class-queue update: `{lane, tag: UpdateState, payload: null, callback: null, next: null}`.[^createupdate] `UpdateState` (0) means "shallow-merge the payload into the previous state", so the HostRoot's state becomes `{...prev, element: <App/>}` when processed.[^updatestate] There is a DEV warning here ("Render methods should be a pure function of props and state") for calling `root.render` from inside a component's render.

### `enqueueUpdate`: deliberately lazy

`enqueueUpdate` (class queue) checks for the unsafe render-phase path. Otherwise it delegates to `enqueueConcurrentClassUpdate`.[^enqueueupdate] That function does **not** link the update into the fiber's queue yet. It pushes a 4-tuple onto a module-level array:[^concurrentenqueue]

```js
// packages/react-reconciler/src/ReactFiberConcurrentUpdates.js (simplified)
function enqueueUpdate(fiber, queue, update, lane) {
  concurrentQueues[concurrentQueuesIndex++] = fiber;
  concurrentQueues[concurrentQueuesIndex++] = queue;
  concurrentQueues[concurrentQueuesIndex++] = update;
  concurrentQueues[concurrentQueuesIndex++] = lane;
  concurrentlyUpdatedLanes = mergeLanes(concurrentlyUpdatedLanes, lane);
  fiber.lanes = mergeLanes(fiber.lanes, lane);            // updated eagerly (bailout checks need it)
  if (fiber.alternate !== null) fiber.alternate.lanes = mergeLanes(fiber.alternate.lanes, lane);
}
```

It then returns `getRootForUpdatedFiber(fiber)`, which walks `.return` up to a `HostRoot` and returns its `stateNode` (the FiberRoot). For the root fiber itself, that is immediate.[^getroot]

**Why defer the linking?** An update can arrive *while a concurrent render is in progress*, for example an event fires during a yield. If it were appended to `queue.pending` and `childLanes` were bubbled immediately, the in-progress render could see half of the event's updates. Buffering keeps that render consistent. The buffer is drained by `finishQueueingConcurrentUpdates()`, which builds the circular `pending` list and then calls `markUpdateLaneFromFiberToRoot` to set `childLanes` on ancestors.[^finishqueueing] It runs in `prepareFreshStack` at the start of the next render, and at the end of a render.[^finishcallsite]

## 4. `scheduleUpdateOnFiber`

```js
// packages/react-reconciler/src/ReactFiberWorkLoop.js (simplified)
export function scheduleUpdateOnFiber(root, fiber, lane) {
  // If the work loop is suspended on data, or a commit is suspended, restart from the top
  if ((root === workInProgressRoot && (reason === SuspendedOnData || reason === SuspendedOnAction))
      || root.cancelPendingCommit !== null) {
    prepareFreshStack(root, NoLanes);
    markRootSuspended(root, workInProgressRootRenderLanes, workInProgressDeferredLane, false);
  }
  markRootUpdated(root, lane);
  if ((executionContext & RenderContext) !== NoContext && root === workInProgressRoot) {
    // render-phase update: track it, warn in DEV
  } else {
    if (root === workInProgressRoot) { /* interleaved update bookkeeping */ }
    ensureRootIsScheduled(root);
    // legacy-only sync flush (dead code with disableLegacyMode)
  }
}
```

[^scheduleupdate] `markRootUpdated` is short but important:[^markrootupdated]

```js
root.pendingLanes |= updateLane;
if (updateLane !== IdleLane) {
  root.suspendedLanes = NoLanes;   // a new update might unblock suspended work: retry everything
  root.pingedLanes = NoLanes;
  root.warmLanes = NoLanes;
}
```

So after `root.render`, `root.pendingLanes === DefaultLane` (`0b100000`). That bit is the root's only record that work exists.

## 5. `ensureRootIsScheduled` and the microtask

This is the React 18.3+/19 root scheduler. It replaced the old design, where every `setState` immediately called `Scheduler.scheduleCallback`. `ensureRootIsScheduled` now does two cheap things:[^ensureroot]

1. Appends the root to a singly linked list (`firstScheduledRoot` … `lastScheduledRoot` via `root.next`), unless it is already there.
2. Sets `mightHavePendingSyncWork = true` and calls `ensureScheduleIsScheduled`, which queues **at most one** microtask per tick through `scheduleImmediateRootScheduleTask` (guarded by `didScheduleMicrotask`).[^ensureschedule]

```js
function scheduleImmediateRootScheduleTask() {
  if (supportsMicrotasks) {
    scheduleMicrotask(() => {
      // Safari can run microtasks in the middle of render/commit (iframe append); bail to a macrotask then
      if ((getExecutionContext() & (RenderContext | CommitContext)) !== NoContext) {
        Scheduler_scheduleCallback(ImmediateSchedulerPriority, processRootScheduleInImmediateTask);
        return;
      }
      processRootScheduleInMicrotask();
    });
  } else {
    Scheduler_scheduleCallback(ImmediateSchedulerPriority, processRootScheduleInImmediateTask);
  }
}
```

[^immediatetask] For DOM, `scheduleMicrotask` is `queueMicrotask`, with fallbacks to `Promise.resolve().then` and then `setTimeout`.[^schedulemicrotask]

**Why a microtask?** It is the natural batching boundary. Every update in the same synchronous JS turn (ten `setState`s in a handler, a `root.render` followed by a `setState`) gets merged into `pendingLanes` before anyone decides what to render. This is "automatic batching", and it works the same inside `setTimeout`, promises and native handlers, because it no longer depends on React knowing it is "inside an event".

### `processRootScheduleInMicrotask`

[^processmicrotask] It clears `didScheduleMicrotask` and walks the root list. For each root it calls `scheduleTaskForRootDuringMicrotask`, and removes roots that return `NoLane`. The comment notes this microtask is the *only* place roots leave the list, which guards against reentrancy bugs. Finally it calls `flushSyncWorkAcrossRoots_impl` to **synchronously render any root whose next lanes include `SyncLane`**, right there in the microtask.[^flushsyncacross]

### `scheduleTaskForRootDuringMicrotask`: Sync vs everything else

```js
// simplified
markStarvedLanesAsExpired(root, currentTime);
const nextLanes = getNextLanes(root, wipLanes, rootHasPendingCommit);
if (nextLanes === NoLanes || suspendedOnData || root.cancelPendingCommit !== null) {
  cancel existing; root.callbackNode = null; return NoLane;
}
if (includesSyncLane(nextLanes) && !checkIfRootIsPrerendering(root, nextLanes)) {
  // Synchronous work is always flushed at the end of the microtask, so we don't need an additional task.
  root.callbackPriority = SyncLane; root.callbackNode = null; return SyncLane;
}
const newCallbackPriority = getHighestPriorityLane(nextLanes);
if (newCallbackPriority === root.callbackPriority) return newCallbackPriority;  // reuse existing task
cancelCallback(root.callbackNode);
switch (lanesToEventPriority(nextLanes)) {
  case DiscreteEventPriority: case ContinuousEventPriority: schedulerPriorityLevel = UserBlockingPriority; break;
  case DefaultEventPriority: schedulerPriorityLevel = NormalPriority; break;
  case IdleEventPriority:    schedulerPriorityLevel = IdlePriority; break;
}
root.callbackNode = scheduleCallback(schedulerPriorityLevel, performWorkOnRootViaSchedulerTask.bind(null, root));
root.callbackPriority = newCallbackPriority;
```

[^scheduletask] For our first render: `nextLanes = DefaultLane`, not sync → `NormalPriority` Scheduler task. `root.callbackNode` now holds the Scheduler `Task` object, and `root.callbackPriority = DefaultLane`.

The "same priority → reuse the existing task" check is why ten `setState`s at the same priority do not create ten tasks. A higher-priority update cancels the task and books a new one at the higher priority.

## 6. The Scheduler task: `performWorkOnRootViaSchedulerTask`

In a later macrotask (the Scheduler's `MessageChannel` message; see [[04 Lanes and the Scheduler|Lanes & Scheduler]]), the Scheduler calls the bound function with `didTimeout`:[^performviascheduler]

1. If an async commit is still pending (View Transition), bail: clear `callbackNode` and return `null`.
2. `flushPendingEffectsDelayed()` flushes leftover passive effects from a previous commit. If that cancelled this task, exit.
3. **Recompute `getNextLanes`.** The comment explains why: Scheduler batches several callbacks into one macrotask without running microtasks in between, so new updates may have arrived since the microtask.
4. `performWorkOnRoot(root, lanes, forceSync = !disableSchedulerTimeoutInWorkLoop && didTimeout)` enters the work loop.
5. Afterwards, call `scheduleTaskForRootDuringMicrotask` again. If `root.callbackNode` is still the same task, **return a continuation** (`performWorkOnRootViaSchedulerTask.bind(null, root)`). The Scheduler keeps the same task in its heap and calls it again after yielding to the browser.

Sync lanes take the other path: `performSyncWorkOnRoot` (from the microtask flush) calls `performWorkOnRoot(root, lanes, true)`.[^performsync]

### Where this page stops: `performWorkOnRoot`

```js
const shouldTimeSlice =
  (!forceSync && !includesBlockingLane(lanes) && !includesExpiredLane(root, lanes))
  || checkIfRootIsPrerendering(root, lanes);
let exitStatus = shouldTimeSlice ? renderRootConcurrent(root, lanes) : renderRootSync(root, lanes, true);
```

[^performworkonroot] `includesBlockingLane` covers Sync, InputContinuous, **Default** and Gesture lanes (and their hydration variants).[^blockinglane] So the initial render, although it arrives through a Scheduler task, runs in **`renderRootSync`**: no yielding between fibers. Only transitions, retries, idle and offscreen work are time-sliced. The work loop itself (`prepareFreshStack`, `workLoopSync`, `performUnitOfWork`) is covered in [[06 The Work Loop - Render Phase|Work Loop]].

> [!warning] Misconception: "createRoot makes the initial render concurrent/interruptible"
> It makes it *asynchronous* (it starts in a later task, so your `root.render` call returns immediately). It does not make it *time-sliced*. A huge initial tree still blocks the main thread for its whole render. To get yielding, wrap the update in `startTransition`. Note that a later Sync/Default update will then interrupt and restart it (see [[04 Lanes and the Scheduler|Lanes & Scheduler]]).

## Timeline of a cold start

| When | What happens |
|---|---|
| sync, in your script | `createRoot` + `root.render`: update queued, `pendingLanes = DefaultLane`, microtask queued |
| rest of your script | any other code. More `root.render` calls overwrite: each is a new update, and the last payload wins when processed in order |
| microtask checkpoint | `processRootScheduleInMicrotask` → Scheduler `NormalPriority` task → `port.postMessage` |
| next macrotask (after possible paint of HTML shell) | `performWorkOnRootViaSchedulerTask` → `renderRootSync` → commit (see [[09 Commit Phase - Mutation, Layout, Passive Effects\|Commit Phase]]) |
| a later frame | browser paints the committed DOM |

Because rendering starts in a macrotask and not a microtask, the browser *can* paint the static HTML in between. That is one reason a server-rendered or static shell stays visible until React commits.

## With the React Compiler

Unchanged. The compiler does not touch `react-dom` or the reconciler's scheduling code. `root.render` still produces exactly one update on the HostRoot at the same lane. The compiler's effect shows up later, inside the render (fewer allocations of JSX and closures, and skipped child work on updates). It does not change how much work gets *scheduled*. See [[15 Rendering With vs Without the Compiler|With vs Without Compiler]].

## Summary

`root.render(<App />)` only records intent. It picks a lane, wraps the element in an `Update`, buffers it, marks the lane pending on the FiberRoot from [[02 createRoot - FiberRoot and HostRoot|createRoot]], and queues one microtask. That microtask is the batching boundary: every update from the same synchronous turn lands in `pendingLanes` before the root scheduler flushes sync work or books a Scheduler task. The first render is asynchronous, not time-sliced. The next part covers the lanes and Scheduler this path leans on.

### Key takeaways

- **`requestUpdateLane`**: decides every update's lane; a top-level `root.render` gets `DefaultLane`.
- **Call site matters**: a native `click` listener or `flushSync` gives `SyncLane`, `startTransition` a transition lane.
- **`updateContainerImpl`**: builds an `UpdateState` update whose `{element}` payload is shallow-merged into the HostRoot state.
- **`concurrentQueues`**: linking is deferred so an in-progress render never sees half of an event's updates.
- **`markRootUpdated`**: sets the lane in `root.pendingLanes`, the root's only record that work exists.
- **`ensureRootIsScheduled`**: lists the root and queues at most one microtask per tick, which makes batching automatic everywhere.
- **`scheduleTaskForRootDuringMicrotask`**: sync lanes flush at the end of the microtask, same-priority tasks are reused, anything else books a Scheduler task.
- **`performWorkOnRootViaSchedulerTask`**: recomputes `getNextLanes`, calls `performWorkOnRoot`, and returns a continuation if the same task is still scheduled.
- **`includesBlockingLane`**: includes `DefaultLane`, so the initial render runs in `renderRootSync`; only `startTransition` gets you yielding.

← [[02 createRoot - FiberRoot and HostRoot|Prev]] · [[00 React Internals Index|Index]] · [[04 Lanes and the Scheduler|Next]] →

[^render]: `ReactDOMRoot.prototype.render` — [packages/react-dom/src/client/ReactDOMRoot.js#L107-L136](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom/src/client/ReactDOMRoot.js#L107-L136)
[^updatecontainer]: `updateContainer` — [packages/react-reconciler/src/ReactFiberReconciler.js#L353-L370](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberReconciler.js#L353-L370)
[^requestupdatelane]: `requestUpdateLane` — [packages/react-reconciler/src/ReactFiberWorkLoop.js#L812-L868](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberWorkLoop.js#L812-L868)
[^resolvepriority]: `resolveUpdatePriority` — [packages/react-dom-bindings/src/client/ReactDOMUpdatePriority.js#L35-L45](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom-bindings/src/client/ReactDOMUpdatePriority.js#L35-L45)
[^eventpriorities]: Event priorities are lanes — [packages/react-reconciler/src/ReactEventPriorities.js#L22-L28](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactEventPriorities.js#L22-L28)
[^geteventpriority]: `getEventPriority` — [packages/react-dom-bindings/src/events/ReactDOMEventListener.js#L312-L416](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom-bindings/src/events/ReactDOMEventListener.js#L312-L416)
[^updatecontainerimpl]: `updateContainerImpl` — [packages/react-reconciler/src/ReactFiberReconciler.js#L393-L458](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberReconciler.js#L393-L458)
[^createupdate]: `createUpdate` — [packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L210-L221](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L210-L221)
[^updatestate]: `UpdateState` / `ReplaceState` — [packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L155-L156](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L155-L156)
[^enqueueupdate]: class-queue `enqueueUpdate` — [packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L223-L274](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L223-L274)
[^concurrentenqueue]: concurrent `enqueueUpdate` / `enqueueConcurrentClassUpdate` — [packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L90-L163](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L90-L163)
[^getroot]: `getRootForUpdatedFiber` — [packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L252-L276](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L252-L276)
[^finishqueueing]: `finishQueueingConcurrentUpdates` — [packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L50-L84](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L50-L84)
[^finishcallsite]: call in `prepareFreshStack` — [packages/react-reconciler/src/ReactFiberWorkLoop.js#L2284](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2284) (also L2764, L3048 at the end of sync/concurrent renders)
[^scheduleupdate]: `scheduleUpdateOnFiber` — [packages/react-reconciler/src/ReactFiberWorkLoop.js#L987-L1113](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberWorkLoop.js#L987-L1113)
[^markrootupdated]: `markRootUpdated` — [packages/react-reconciler/src/ReactFiberLane.js#L825-L849](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberLane.js#L825-L849)
[^ensureroot]: `ensureRootIsScheduled` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L116-L152](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L116-L152)
[^ensureschedule]: `ensureScheduleIsScheduled` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L154-L169](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L154-L169)
[^immediatetask]: `scheduleImmediateRootScheduleTask` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L650-L696](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L650-L696)
[^schedulemicrotask]: DOM `scheduleMicrotask` — [packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L871-L877](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L871-L877)
[^processmicrotask]: `processRootScheduleInMicrotask` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L259-L348](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L259-L348)
[^flushsyncacross]: `flushSyncWorkAcrossRoots_impl` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L185-L247](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L185-L247)
[^scheduletask]: `scheduleTaskForRootDuringMicrotask` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L384-L509](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L384-L509)
[^performviascheduler]: `performWorkOnRootViaSchedulerTask` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L513-L606](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L513-L606)
[^performsync]: `performSyncWorkOnRoot` — [packages/react-reconciler/src/ReactFiberRootScheduler.js#L608-L622](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberRootScheduler.js#L608-L622)
[^performworkonroot]: `performWorkOnRoot` / `shouldTimeSlice` — [packages/react-reconciler/src/ReactFiberWorkLoop.js#L1137-L1181](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1137-L1181)
[^blockinglane]: `includesBlockingLane` — [packages/react-reconciler/src/ReactFiberLane.js#L684-L694](https://github.com/facebook/react/blob/v19.3.1/packages/react-reconciler/src/ReactFiberLane.js#L684-L694)
[^flushsync]: `flushSync` sets `ReactDOMSharedInternals.p = DiscreteEventPriority` — [packages/react-dom/src/shared/ReactDOMFlushSync.js#L22-L35](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom/src/shared/ReactDOMFlushSync.js#L22-L35)

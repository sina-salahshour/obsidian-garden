#!/usr/bin/env node
// Social cards from the real pages: opens every post and series page of the deployed site in headless
// Chromium at the card size (1200x630, light theme, reduced motion) and saves its first view as
// public/og/<page path>.jpg, plus src/lib/og-shots.json (the list seo() picks them from). The home
// page's first view becomes the site-wide /og.png.
// Usage: node scripts/og-screenshots.ts [base-url]   (default https://www.datagarden.ir; $CHROME = binary)
// Run it after a deploy that changes how pages look (accent, fonts, layout), then commit the output.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const base = (process.argv[2] ?? "https://www.datagarden.ir").replace(/\/$/, "");
const chrome = process.env.CHROME ?? "chromium";
const PORT = 9334;
const WIDTH = 1200;
const HEIGHT = 630;
const root = join(import.meta.dirname, "..");

const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => new URL(m[1]!).pathname)
  .filter((p) => p === "/" || /^\/(posts|series)\/.+/.test(p));
if (!paths.length) throw new Error(`no pages found in ${base}/sitemap.xml`);

const profile = await mkdtemp(join(tmpdir(), "og-chrome-"));
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const devtools = `http://127.0.0.1:${PORT}`;

try {
  for (let i = 0; ; i++) {
    if (
      await fetch(`${devtools}/json/version`).then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    if (i > 50) throw new Error(`${chrome} did not start (set $CHROME to a Chromium binary)`);
    await sleep(100);
  }

  const shots: string[] = [];
  for (const path of paths) {
    const home = path === "/";
    const out = home ? "/og.png" : `/og${path}.jpg`;
    const image = await capture(`${base}${path}`, home ? "png" : "jpeg");
    const file = join(root, "public", out);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, image);
    if (!home) shots.push(out);
    console.log(`og: ${path} -> public${out} (${Math.round(image.length / 1024)} KB)`);
  }
  shots.sort();
  await writeFile(join(root, "src/lib/og-shots.json"), `${JSON.stringify(shots, null, 2)}\n`);
  console.log(`og: ${shots.length} page cards + /og.png`);
} finally {
  // wait for Chromium to exit: it keeps writing to its profile while shutting down
  const exited = new Promise((r) => browser.once("exit", r));
  browser.kill();
  await Promise.race([exited, sleep(5000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** One page in a fresh tab: card-sized viewport, light scheme, no motion, fonts loaded. */
async function capture(url: string, format: "png" | "jpeg"): Promise<Buffer> {
  const target = (await (
    await fetch(`${devtools}/json/new?about:blank`, { method: "PUT" })
  ).json()) as {
    id: string;
    webSocketDebuggerUrl: string;
  };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r);
    ws.addEventListener("error", j);
  });
  let id = 0;
  const pending = new Map<number, (v: { result?: any; error?: { message: string } }) => void>();
  const events = new Map<string, () => void>();
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(String(m.data));
    if (msg.id) pending.get(msg.id)?.(msg);
    else events.get(msg.method)?.();
  });
  const send = async (method: string, params: object = {}) => {
    const reply = await new Promise<{ result?: any; error?: { message: string } }>((r) => {
      pending.set(++id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
    if (reply.error) throw new Error(`${method}: ${reply.error.message}`);
    return reply.result;
  };
  try {
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: "light" },
        { name: "prefers-reduced-motion", value: "reduce" },
      ],
    });
    const loaded = new Promise<void>((r) => events.set("Page.loadEventFired", r));
    await send("Page.navigate", { url });
    await Promise.race([loaded, sleep(15_000)]);
    await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
    // streamed sections and the inlined cover settle; entrance animations are off (reduced motion)
    await sleep(800);
    const { data } = await send("Page.captureScreenshot", {
      format,
      ...(format === "jpeg" ? { quality: 88 } : {}),
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
    });
    return Buffer.from(data, "base64");
  } finally {
    ws.close();
    await fetch(`${devtools}/json/close/${target.id}`).catch(() => {});
  }
}

// Regenerates README screenshots from a running demo stack.
//
// Prereq: `docker compose --profile demo up -d` is running and the GUI is at :5173.
// Run:    npm i --no-save playwright && node scripts/screenshots.mjs
//
// Playwright is intentionally not a project dependency — this script is for the
// maintainer who refreshes the docs, not for users of the library.
import { chromium } from "playwright";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:4000";
const OUT = process.env.OUT_DIR ?? "docs/screenshots";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();

async function shot(name, prep) {
  await page.goto(BASE);
  await sleep(800);
  if (prep) await prep();
  await sleep(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`captured ${name}`);
}

await shot("design", async () => {
  // Design is the default view.
});

await shot("deploy", async () => {
  await page.click("text=Deploy");
});

await shot("try", async () => {
  await page.click("text=Try it");
});

await shot("live", async () => {
  await page.click("text=Live");
  await sleep(2500);
});

await shot("onboarding", async () => {
  await page.click("text=Run setup tour");
  await sleep(500);
});

await browser.close();

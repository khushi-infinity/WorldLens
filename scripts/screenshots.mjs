/**
 * WorldLens screenshot capture for the README.
 * Usage: node scripts/screenshots.mjs
 * Requires the dev or production server on http://localhost:3000
 *
 * Screenshots are captured on the Demo Mode path (previously captured SerpApi
 * responses served as CACHED) for the polished flagship world, plus one LIVE
 * capture so the README shows both.
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = join(process.cwd(), "docs", "screenshots");
mkdirSync(OUT, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=metal", "--enable-webgl"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });

const clickByText = (text, exact = false) => page.evaluate(({ text, exact }) => {
  const els = [...document.querySelectorAll("button, a")];
  const el = els.find(e => {
    const t = (e.textContent ?? "").trim();
    return exact ? t === text : t.includes(text);
  });
  el?.click();
  return !!el;
}, { text, exact });

async function shot(name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log("captured", name);
}

// ---------------------------------------------------------------- 1. Landing
await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
await wait(2500);
await shot("01-landing");

// ------------------------------------------- 2. Loading sequence (LIVE topic)
await page.type('input[placeholder="Explore anything..."]', "Artificial Intelligence in India");
await clickByText("Explore", true);
// Capture mid-flight, while engines are still resolving, so the staged UI shows
// live status dots rather than a completed run.
await wait(700);
await shot("02-loading");

// Wait for the world to materialize
await page.waitForSelector("canvas", { timeout: 240000 });
await wait(14000);
await shot("03-live-world");

// Back to landing, then enter Demo Mode for the polished flagship world
await clickByText("WORLDLENS");
await wait(1500);
await clickByText("No network? Enter Demo Mode");
await wait(9000);
await shot("04-world-overview");

// ------------------------------------------------- 5. Entity intelligence panel
await clickByText("Find entity");
await wait(600);
await page.type('input[placeholder="Type a name, camera flies to it"]', "Sarvam");
await wait(1000);
// Click the suggestion with a real mouse event so React's onClick fires.
for (const b of await page.$$("button")) {
  const txt = await b.evaluate(el => el.textContent ?? "");
  if (txt.includes("Sarvam AI") && txt.includes("startup")) { await b.click(); break; }
}
await wait(5500);
await shot("05-entity-panel");

// ------------------------------------------------------- 6. Relationship evidence
// The "why?" button on a connection row opens the Link tab with the evidence.
for (const b of await page.$$("button")) {
  const txt = (await b.evaluate(el => el.textContent ?? "")).trim();
  if (txt === "why?") { await b.click(); break; }
}
await wait(2500);
await shot("06-relationship-evidence");

// ---------------------------------------------------------- 7. Cluster isolation
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /Generative AI/.test(x.textContent ?? ""));
  b?.click();
});
await wait(4000);
await shot("07-cluster-isolated");

// ------------------------------------------------------------ 8. Time travel tab
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => x.textContent?.trim() === "Time travel");
  b?.click();
});
await wait(1500);
await shot("08-time-travel");

// ------------------------------------------------------------------- 9. Legend
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => (x.textContent ?? "").includes("How to read this"));
  b?.click();
});
await wait(1200);
await shot("09-legend");

// ------------------------------------------------------------- 10. Mobile layout
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
await wait(3000);
await shot("10-mobile");

await browser.close();
console.log("done ->", OUT);

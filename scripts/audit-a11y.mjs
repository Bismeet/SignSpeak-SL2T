/**
 * Throwaway audit: structural / screen-reader accessibility.
 *
 * The contrast audits covered colour. This covers the other half of AA — the parts a sighted
 * reviewer never notices, and the parts that matter most to the users this app exists for:
 *
 *   1. target sizes (WCAG 2.2 AA 2.5.8) — the project claims a 48px floor and 96px in emergency;
 *   2. heading order — no skipped levels, one h1 per route;
 *   3. landmarks — a main, and navs that are distinguishable from each other;
 *   4. `lang` — Devanagari must be marked `hi`, or a screen reader reads it with an English voice;
 *   5. live regions — recognised signs arrive asynchronously and must be announced;
 *   6. positive `tabindex` — breaks natural focus order;
 *   7. dialog semantics — role, aria-modal, accessible name;
 *   8. form controls without an accessible name.
 *
 * Structure does not vary by theme, so this runs once in the dark theme rather than three times.
 *
 * Run: node scripts/audit-a11y.mjs <baseUrl>
 */
import { chromium } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4321';

const PAGES = [
  '/',
  '/talk/',
  '/emergency/',
  '/phrases/',
  '/settings/',
  '/help/',
  '/privacy/',
  '/limitations/',
  '/collect/',
];

/** Injected into the page. Self-contained: `page.evaluate` serialises it. */
function audit(route) {
  const out = { targets: [], headings: [], landmarks: [], lang: [], live: [], tabindex: [], dialogs: [], names: [] };

  const label = (el) => {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 40) || `<${el.tagName.toLowerCase()}>`;
  };
  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3) : [];
    return el.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : '');
  };

  // --- 1. target size ---------------------------------------------------------------------
  // WCAG 2.5.8 exempts a target that is "in a sentence or block of text" — which in practice
  // means the link still flows inline. `display: inline` is the honest test for that. An earlier
  // version of this audit exempted any <a> with a p/li/span ancestor, which silently skipped
  // every desktop nav link (AppShell wraps them in <li>) — the exact elements 2.5.8 protects.
  // Anything the author laid out as inline-flex/flex/inline-block is a designed target and must
  // meet the floor.
  const interactive = document.querySelectorAll(
    'button, input:not([type="hidden"]), select, textarea, a[href], [role="button"], [role="radio"], [role="tab"]',
  );
  for (const el of interactive) {
    if (el.getClientRects().length === 0) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
    // The 96px claim applies to emergency actions, not to every control that happens to sit on
    // the emergency route (the theme toggle there is still a normal 48px control).
    const emergency = /^\/emergency/.test(route) && !el.closest('header, footer') && el.matches('button, [role="button"]');
    out.targets.push({
      w: Math.round(r.width),
      h: Math.round(r.height),
      inline,
      emergency,
      where: describe(el),
      text: label(el),
    });
  }

  // --- 2. heading order -------------------------------------------------------------------
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')];
  let prev = 0;
  for (const h of headings) {
    const level = Number(h.tagName[1]);
    out.headings.push({ level, text: label(h), skippedFrom: prev && level > prev + 1 ? prev : null });
    prev = level;
  }

  // --- 3. landmarks -----------------------------------------------------------------------
  const main = document.querySelectorAll('main');
  out.landmarks.push({ kind: 'main', count: main.length });
  for (const nav of document.querySelectorAll('nav')) {
    const name = nav.getAttribute('aria-label') || nav.getAttribute('aria-labelledby');
    out.landmarks.push({
      kind: 'nav',
      count: 1,
      name,
      hidden: nav.getClientRects().length === 0,
    });
  }
  out.landmarks.push({ kind: 'header', count: document.querySelectorAll('header').length });
  out.landmarks.push({ kind: 'footer', count: document.querySelectorAll('footer').length });

  // --- 4. language ------------------------------------------------------------------------
  const devanagari = /[\u0900-\u097F]/;
  for (const el of document.querySelectorAll('body *')) {
    if (el.getClientRects().length === 0) continue;
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('');
    if (!devanagari.test(own)) continue;
    const marked = el.closest('[lang]');
    out.lang.push({
      hasLang: Boolean(marked),
      langValue: marked?.getAttribute('lang') ?? null,
      text: own.trim().slice(0, 30),
      where: describe(el),
    });
  }

  // --- 5. live regions --------------------------------------------------------------------
  const live = document.querySelectorAll('[aria-live], [role="status"], [role="log"], [role="alert"]');
  out.live.push({ count: live.length });
  for (const el of live) {
    out.live.push({
      count: 1,
      role: el.getAttribute('role'),
      ariaLive: el.getAttribute('aria-live'),
      text: label(el).slice(0, 30),
      where: describe(el),
    });
  }

  // --- 6. positive tabindex ---------------------------------------------------------------
  for (const el of document.querySelectorAll('[tabindex]')) {
    const v = Number(el.getAttribute('tabindex'));
    if (v > 0) out.tabindex.push({ value: v, where: describe(el), text: label(el) });
  }

  // --- 7. dialog semantics ----------------------------------------------------------------
  for (const d of document.querySelectorAll('[role="dialog"], dialog')) {
    out.dialogs.push({
      role: d.getAttribute('role') ?? 'dialog',
      ariaModal: d.getAttribute('aria-modal'),
      name: d.getAttribute('aria-label') || d.getAttribute('aria-labelledby') || null,
      where: describe(d),
    });
  }

  // --- 8. form controls without an accessible name ----------------------------------------
  for (const el of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
    if (el.getClientRects().length === 0) continue;
    const id = el.getAttribute('id');
    const named =
      (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
      el.closest('label') ||
      el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      el.getAttribute('title');
    if (!named) out.names.push({ where: describe(el), type: el.getAttribute('type') ?? el.tagName.toLowerCase() });
  }

  return out;
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROME_PATH || undefined,
});
// Touch targets are a mobile concern, and at 1280px the bottom nav is `lg:hidden` — a
// desktop-only pass would never test the primary emergency entry points on a phone.
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

const problems = [];
/** Findings that are real but are a design tension rather than a violation. */
const notes = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await context.addInitScript(() => {
    window.localStorage.setItem('signspeak.intro.seen.v1', '1');
    window.localStorage.setItem('signspeak.settings.v1', JSON.stringify({ theme: 'dark' }));
  });
  const page = await context.newPage();

  for (const route of PAGES) {
    // `path` carries the viewport so findings stay attributable across both passes.
    const path = `${vp.name} ${route}`;
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-theme') === 'dark',
      undefined,
      { timeout: 15_000 },
    );
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });

  const r = await page.evaluate(audit, route);

  // 1. targets: AA hard floor is 24px; the project claims 48px, and 96px for emergency actions.
  const real = r.targets.filter((t) => !t.inline);
  const small = real.filter((t) => t.w < 24 || t.h < 24);
  const underClaim = real.filter((t) => t.w < 48 || t.h < 48);
  // A target that misses 96px in BOTH dimensions is a real miss. One that misses in only one
  // dimension is width-bound by a shared row (the 11-button pain scale), which is a layout
  // tension to report, not a failure.
  const emgBoth = r.targets.filter((t) => t.emergency && t.w < 96 && t.h < 96);
  const emgOne = r.targets.filter((t) => t.emergency && (t.w < 96) !== (t.h < 96));
  if (small.length) problems.push({ path, kind: 'target <24px (AA fail)', items: small });
  if (underClaim.length) problems.push({ path, kind: 'target <48px (project claim)', items: underClaim });
  if (emgBoth.length) {
    problems.push({ path, kind: 'emergency action <96px in BOTH dimensions', items: emgBoth });
  }
  if (emgOne.length) {
    notes.push({ path, kind: 'emergency control <96px in one dimension (row-bound)', items: emgOne });
  }

  // 2. headings
  const h1s = r.headings.filter((h) => h.level === 1).length;
  const skips = r.headings.filter((h) => h.skippedFrom);
  if (h1s !== 1) problems.push({ path, kind: `h1 count = ${h1s}`, items: r.headings });
  if (skips.length) problems.push({ path, kind: 'heading level skipped', items: skips });

  // 3. landmarks
  const mains = r.landmarks.filter((l) => l.kind === 'main')[0];
  if (mains.count !== 1) problems.push({ path, kind: `main count = ${mains.count}`, items: [] });
  const visibleNavs = r.landmarks.filter((l) => l.kind === 'nav' && !l.hidden);
  const unnamedNavs = visibleNavs.filter((n) => !n.name);
  if (visibleNavs.length > 1 && unnamedNavs.length) {
    problems.push({ path, kind: 'multiple navs, some unnamed', items: unnamedNavs });
  }

  // 4. language
  const unmarked = r.lang.filter((l) => !l.hasLang);
  const wrongLang = r.lang.filter((l) => l.hasLang && l.langValue && !l.langValue.startsWith('hi'));
  if (unmarked.length) problems.push({ path, kind: 'Devanagari without lang', items: unmarked });
  if (wrongLang.length) problems.push({ path, kind: 'Devanagari with non-hi lang', items: wrongLang });

  // 5. live regions — reported, not failed: the route may legitimately have no dynamic region.
  // 6. tabindex
  if (r.tabindex.length) problems.push({ path, kind: 'positive tabindex', items: r.tabindex });
  // 7. dialogs
  const badDialogs = r.dialogs.filter((d) => !d.name);
  if (badDialogs.length) problems.push({ path, kind: 'dialog without accessible name', items: badDialogs });
  // 8. control names
  if (r.names.length) problems.push({ path, kind: 'control without accessible name', items: r.names });

  // Report the exempted count too: if `exempt` ever equals `targets`, the exemption is eating
  // the audit and a green result means nothing.
  const exempt = r.targets.filter((t) => t.inline).length;
  const emergencyCount = r.targets.filter((t) => t.emergency).length;
  const liveCount = r.live[0].count;
  console.log(
    `${path.padEnd(24)} h1=${h1s} headings=${r.headings.length} targets=${real.length} exempt=${exempt} ` +
      `emg=${emergencyCount} live=${liveCount} dialogs=${r.dialogs.length} devanagari=${r.lang.length}`,
  );
  }

  await context.close();
}

// --- state-dependent probes ----------------------------------------------------------------
// Two things the at-rest walk above structurally cannot see, and both produced bad data when
// it tried: a skip link that is deliberately 1x1 until focused, and a dialog that is not in
// the DOM until opened (`Dialog` returns null when closed).
async function probeContext(browser, seedIntro) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((seen) => {
    if (seen) window.localStorage.setItem('signspeak.intro.seen.v1', '1');
    else window.localStorage.removeItem('signspeak.intro.seen.v1');
    window.localStorage.setItem('signspeak.settings.v1', JSON.stringify({ theme: 'dark' }));
  }, seedIntro);
  return context;
}

{
  // 1. Skip link, measured in the state a keyboard user actually meets it.
  const context = await probeContext(browser, true);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  await page.keyboard.press('Tab');
  const skip = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || !el.classList.contains('sr-only-focusable')) return { missing: true };
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || '').trim() };
  });
  console.log(`\nfocused skip link: ${JSON.stringify(skip)}`);
  if (skip.missing) {
    problems.push({ path: 'desktop / (focused)', kind: 'skip link is not the first tab stop', items: [skip] });
  } else if (skip.w < 48 || skip.h < 48) {
    problems.push({ path: 'desktop / (focused)', kind: 'skip link <48px when focused', items: [skip] });
  }
  await context.close();
}

{
  // 2. Dialog semantics, with the intro dialog actually open.
  const context = await probeContext(browser, false);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  await page.waitForSelector('[role="dialog"]', { timeout: 15_000 });

  const info = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const labelledby = d.getAttribute('aria-labelledby');
    const target = labelledby ? document.getElementById(labelledby) : null;
    const r = d.getBoundingClientRect();
    return {
      role: d.getAttribute('role'),
      ariaModal: d.getAttribute('aria-modal'),
      labelledby,
      resolves: Boolean(target),
      name: target ? target.textContent.trim().slice(0, 40) : null,
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });
  console.log(`open dialog: ${JSON.stringify(info)}`);

  // Focus trap: 30 tabs must never land outside the dialog.
  let escaped = null;
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab');
    const outside = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const a = document.activeElement;
      return d && a && !d.contains(a) ? a.tagName + '.' + (a.className || '') : null;
    });
    if (outside) {
      escaped = outside;
      break;
    }
  }
  console.log(`focus trap: ${escaped ? `ESCAPED to ${escaped}` : 'held for 30 tabs'}`);

  if (info.role !== 'dialog' || info.ariaModal !== 'true' || !info.resolves) {
    problems.push({ path: 'desktop / (dialog)', kind: 'dialog semantics incomplete', items: [info] });
  }
  if (escaped) {
    problems.push({ path: 'desktop / (dialog)', kind: 'focus escaped the dialog', items: [{ escaped }] });
  }
  await context.close();
}

function report(title, list) {
  console.log(`\n=== ${title} ===`);
  if (!list.length) {
    console.log('none');
    return;
  }
  const grouped = new Map();
  for (const p of list) {
    if (!grouped.has(p.kind)) grouped.set(p.kind, []);
    grouped.get(p.kind).push(p);
  }
  for (const [kind, entries] of grouped) {
    console.log(`\n${kind} — ${entries.length} route(s): ${entries.map((p) => p.path).join(' ')}`);
    const sample = entries[0].items.slice(0, 6);
    for (const s of sample) console.log(`   ${JSON.stringify(s)}`);
    if (entries[0].items.length > sample.length) {
      console.log(`   … ${entries[0].items.length - sample.length} more`);
    }
  }
}

report('violations', problems);
report('notes (real, but a design tension rather than a violation)', notes);

await browser.close();

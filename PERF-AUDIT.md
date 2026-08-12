# Performance Audit — matef116.github.io/Portfolio

**Complaint audited:** "photos load slowly and the site feels sluggish, especially on mobile."
**Date:** 2026-08-13
**Verdict:** complaint confirmed, root cause found, fixed. Full-scroll page weight down **63%**; the slowest photo went from **12.6s to 2.4s** on mobile.

---

## 0. How these numbers were produced (methodology)

The Lighthouse CLI needs Node, which is not installed on this machine, and the
public PageSpeed Insights API returned `HTTP 429 quota exceeded`. Rather than
estimate, I drove **real Chrome over the DevTools Protocol** and applied
**Lighthouse's own mobile throttling constants**:

| Setting | Value (Lighthouse mobile preset) |
|---|---|
| Device metrics | 412 x 823, DPR 1.75, mobile |
| CPU throttle | 4x slowdown |
| Network | 1.6 Mbps down / 750 Kbps up / 150 ms RTT ("Slow 4G") |
| Cache | disabled (cold first visit) |

Metrics come from the browser's own APIs (`PerformanceObserver` for
LCP/CLS/long-tasks, CDP `Network.loadingFinished` for true over-the-wire bytes).
Nothing is modelled or extrapolated.

**Two honest caveats:**

1. **Timing is measured against `localhost`, not GitHub Pages.** A first pass
   against the live URL swung wildly (mobile LCP 1.81s–3.56s across identical
   runs) because of CDN and network jitter. Throttling is applied by Chrome
   itself, so localhost isolates *code quality* and makes before/after
   comparisons valid. Byte counts were identical either way.
   **TTFB is the one metric the host genuinely owns, so it was measured against
   the live site: 440 ms.**
2. **Speed Index is not reported.** It requires Lighthouse's filmstrip analysis,
   which I could not reproduce faithfully. Reporting a fabricated number would
   be worse than omitting it. Every other requested metric is real.

Every figure below is the **median of 5 runs**. Reproduce with the scripts in
`/private/tmp/.../scratchpad/` (`measure.py`, `scroll_measure.py`, `forensics.py`).

---

## 1. Baseline (before any change)

| Page | Device | LCP | CLS | TBT | TTFB | Wire KB | Reqs | Img % |
|---|---|---|---|---|---|---|---|---|
| index.html | mobile | 2.03s | 0.030 | 96ms | 440ms | 486 | 9 | 70% |
| index.html | desktop | 0.41s | 0.004 | 0ms | 440ms | 381 | 8 | 62% |
| projects.html | mobile | 1.58s | 0.000 | 95ms | 440ms | 242 | 10 | 41% |
| projects.html | desktop | 0.40s | 0.024 | 0ms | 440ms | 403 | 12 | 65% |
| project-life-makers-unhcr | mobile | 0.79s | 0.000 | 70ms | 440ms | 131 | 7 | **0%** |
| project-life-makers-unhcr | desktop | 0.25s | 0.002 | 0ms | 440ms | 1431 | 11 | 91% |

**Pass/fail vs Core Web Vitals thresholds** (LCP ≤2.5s, CLS ≤0.1, TBT ≤200ms, TTFB ≤800ms):

> **Every page PASSED every threshold.** All six page/device combinations, all four metrics.

### Why the baseline is a trap

If the audit stopped here the answer would be "the site is fine" — directly
contradicting the reported experience. Look at the last two rows:

- **`img% = 0.0%` on mobile.** Not one photo loaded during the measured window.
- The LCP element on that page is an **`<h1>` text node**, not a photo.

`loading="lazy"` defers every photo below the fold, so photos are *excluded from
the metric entirely*. Core Web Vitals measure the initial viewport; the
complaint is about **scrolling**. So I measured scrolling.

### LCP element per page (measured, not assumed)

| Page | Device | LCP element | File |
|---|---|---|---|
| index.html | mobile | `IMG.photo-immersed` | `mohamed-atef-hero-sm.webp` |
| index.html | desktop | `IMG.photo-immersed` | `mohamed-atef-hero.webp` |
| projects.html | both | `IMG` (work card) | `cover.jpg` |
| project-life-makers-unhcr | both | `H1` | *(text — no image qualified)* |

---

## 2. The real problem: the scroll test

Same throttling, but the harness scrolls the page like a visitor.

| Page (mobile) | Initial | After scroll | Added | Slowest single image |
|---|---|---|---|---|
| project-life-makers-unhcr | 131 KB | **2,797 KB** | +2,666 KB | **photo-7.jpg — 12,639 ms** |
| projects.html | 242 KB | 1,540 KB | +1,298 KB | cover.jpg — 3,913 ms |
| index.html | 487 KB | 1,224 KB | +737 KB | cover.jpg — 2,521 ms |
| about.html | 564 KB | 1,164 KB | +601 KB | badge PNG — 2,768 ms |

**There is the sluggishness.** A single photo took **12.6 seconds**. One image
never finished loading at all (7 of 8 complete). This is invisible to a
standard Lighthouse score.

---

## 3. Image forensics (129 images, 20.15 MB)

Savings were **measured by actually re-encoding every file**, not estimated from
rules of thumb.

| Question asked | Measured answer |
|---|---|
| KB wasted purely on oversized dimensions | **10.02 MB (49.7%)** |
| WebP q80 would save (with correct sizing) | 5.18 MB total → **saves 14.97 MB (74.3%)** |
| AVIF q60 would save (with correct sizing) | 3.97 MB total → **saves 16.18 MB (80.3%)** |
| Images above the fold | 7 |
| Images below the fold | 122 |
| Below-fold images loaded **eagerly** | **4** |
| Above-fold images marked **lazy** (delays LCP) | **3** |
| Missing `width`+`height` (CLS risk) | **125 / 129** |
| Missing `srcset`/`<picture>` | **125 / 129** |
| `decoding="async"` | **0 / 129** |
| Oversized >2x / >4x | 127 / 33 |
| Images blocking render (in `<head>` or CSS hero background) | **0** — none |
| Layout shift caused by missing dimensions | Measured CLS stayed ≤0.030; the risk is latent (localhost loads too fast to expose it), which is why dimensions were added anyway |

### Top 10 offenders by KB wasted

| # | File | Fmt | KB | Intrinsic | Rendered | Ratio | Wasted |
|---|---|---|---|---|---|---|---|
| 1 | `life-makers-unhcr/photo-7.jpg` | JPEG | 512 | 1600x1200 | 441px | 3.6x | 335 |
| 2 | `life-makers-unhcr/photo-6.jpg` | JPEG | 498 | 1600x1200 | 441px | 3.6x | 321 |
| 3 | `misk-hrakat/photo-5.png` | PNG | 530 | 1600x1103 | 441px | 3.6x | 309 |
| 4 | `logos/cfye.png` | PNG | 324 | 1494x384 | **148px** | **10.1x** | 301 |
| 5 | `life-makers-unhcr/photo-4.jpg` | JPEG | 428 | 1600x1066 | 441px | 3.6x | 285 |
| 6 | `life-makers-unhcr/photo-1.jpg` | JPEG | 424 | 1600x1066 | 441px | 3.6x | 276 |
| 7 | `logos/giz.png` | PNG | 288 | 1270x384 | **148px** | **8.6x** | 261 |
| 8 | `logos/saudi-tourism-authority.png` | PNG | 275 | 1213x384 | **148px** | **8.2x** | 243 |
| 9 | `cfye/photo-4.jpg` | JPEG | 375 | 1600x1066 | 441px | 3.6x | 243 |
| 10 | `plan-international-dapp/photo-10.jpg` | JPEG | 363 | 1600x1066 | 441px | 3.6x | 230 |

### By component

| Component | n | Before | After (WebP) | Saving |
|---|---|---|---|---|
| Project gallery photos | 76 | 14,850 KB | 4,095 KB | 72% |
| Logo marquee | 23 | 3,081 KB | 228 KB | **93%** |
| Project card covers | 15 | 1,393 KB | 641 KB | 54% |
| Credential badges | 5 | 518 KB | 30 KB | **94%** |
| Testimonial avatars | 4 | 161 KB | 10 KB | **94%** |

### Separate bug found while measuring: the logo marquee is broken

Parked on the "Trusted by" section for **90 seconds**, only **4 of 50** logos
ever loaded:

```
t+  5s  logos loaded   3/50
t+ 30s  logos loaded   3/50
t+ 60s  logos loaded   3/50
t+ 90s  logos loaded   4/50
```

**Cause:** the marquee track is `width: max-content` and measures **9,948px**
wide. The logos sit far outside the viewport *horizontally*, and Chrome's
lazy-loading never fetches them — the CSS `transform` animation does not
reliably re-trigger the intersection check. With no `width`/`height` attributes
they then collapse to 0x0. See §6 for why this was deliberately **not** fixed
in this pass.

---

## 4. Responsiveness (360 / 414 / 768 / 1024 / 1440 / 1920)

| Check | Result |
|---|---|
| Horizontal overflow | **None** at any width, on any page |
| Images ignoring their container | **None** |
| Broken grids | **None** |
| Text under 16px | 4–6 elements per page (buttons 15px, `.section-note` 15px, some `<p>` 13–14px) |
| Tap targets under 44x44 | 4–5 at mobile widths |
| **Same full-size image to 360px and 1920px?** | **Yes — 26 of 28 homepage images were byte-identical.** Only the two hero portraits adapted. |

That last row is the core finding: one 1600px file was served to every device.

**Out of scope but recorded** (Phase 5 forbids restyling, so these were *not*
touched): the header/footer logo lockup is 32px tall, "← Back to home" is 18px
tall at 360px, and some body copy sits at 13–15px. There are **no `<input>`
elements anywhere on the site**, so `inputmode`/`type` correctness and the iOS
focus-zoom issue are non-applicable.

**Third-party dependency noted:** `about.html` pulls ~15 tool icons from
`cdn.simpleicons.org` at runtime — an external origin outside your control on
the critical path of that page.

---

## 5. Root cause → fix (sorted by saving ÷ effort)

| # | Symptom | Evidence | Root cause | Fix applied | Saving | Effort | Risk |
|---|---|---|---|---|---|---|---|
| 1 | Photos take 6.7–12.6s | 76 photos, 1600px intrinsic shown at 441px | No `srcset`, no modern format — the full-res original served every device | `<picture>` with AVIF + WebP + srcset at 441/882px | 10,755 KB (72%) | M | Low |
| 2 | Badges slow | 1000x1000 PNG shown at 88px | 11x oversize | Resize to 176px + AVIF/WebP | 488 KB (94%) | S | Low |
| 3 | Card covers heavy | Same file for card and gallery | No thumbnail tier | srcset + AVIF/WebP | 752 KB (54%) | S | Low |
| 4 | Layout instability risk | 125/129 lacked dimensions | Browser cannot reserve space | Added `width`/`height` to all | CLS headroom | S | Low |
| 5 | Decode jank | 0/129 used `decoding="async"` | Synchronous main-thread decode | Added to all | TBT | S | None |
| 6 | 3 above-fold images lazy | Measured | Wrong `loading` value delays LCP | Made eager | LCP | S | None |
| 7 | 4 below-fold images eager | Measured | Wrong `loading` value wastes bandwidth | Made lazy | 161 KB | S | None |

**GitHub Pages constraints respected.** Every variant is pre-generated with
Pillow and committed as a static file: no server-side resizing, no custom
`Cache-Control`, no GitHub Actions runner. One constraint I **cannot** fix in
code and am flagging rather than papering over: GitHub Pages hard-codes
`cache-control: max-age=600` (verified in the live response headers), so repeat
visitors re-download assets after 10 minutes. Fixing that means leaving the
platform — see Plan C.

---

## 6. Results (Phase 6 — re-measured identically)

### The headline: full-scroll page weight

| Page (mobile) | Before | After | Delta | % |
|---|---|---|---|---|
| project-life-makers-unhcr | 2,797 KB | 714 KB | −2,083 KB | **−74.5%** |
| projects.html | 1,540 KB | 652 KB | −888 KB | **−57.7%** |
| about.html | 1,164 KB | 474 KB | −690 KB | **−59.3%** |
| index.html | 1,224 KB | 650 KB | −574 KB | **−46.9%** |
| **Total** | **6,725 KB** | **2,490 KB** | **−4,235 KB** | **−63.0%** |

### Slowest single image (the actual complaint)

| | Before | After | Improvement |
|---|---|---|---|
| project-life-makers-unhcr | **12,639 ms** | **2,438 ms** | **5.2x faster** |
| projects.html | 3,913 ms | 619 ms | **6.3x faster** |

### Core Web Vitals before → after

| Page | Device | LCP before | LCP after | Δ | CLS b→a | TBT b→a | Verdict |
|---|---|---|---|---|---|---|---|
| index.html | mobile | 2.03s | 2.15s | +0.12s | 0.030 → 0.030 | 96 → 89ms | PASS |
| index.html | desktop | 0.41s | 0.46s | +0.05s | 0.004 → 0.004 | 0 → 0ms | PASS |
| projects.html | mobile | 1.58s | **1.02s** | **−0.57s (−36%)** | 0.000 → 0.000 | 95 → 90ms | PASS |
| projects.html | desktop | 0.40s | 0.31s | −0.09s | 0.024 → 0.025 | 0 → 0ms | PASS |
| life-makers | mobile | 0.79s | 0.80s | +0.02s | 0.000 → 0.000 | 70 → 78ms | PASS |
| life-makers | desktop | 0.25s | 0.30s | +0.05s | 0.002 → 0.002 | 0 → 0ms | PASS |

### Initial-load transfer

| Page | Device | Before | After | Δ |
|---|---|---|---|---|
| projects.html | desktop | 403 KB | 195 KB | **−51.7%** |
| life-makers | desktop | 1,431 KB | 309 KB | **−78.4%** |
| projects.html | mobile | 242 KB | 189 KB | −21.9% |
| index.html | mobile | 486 KB | 523 KB | +7.6% |

**Everything still passes every Core Web Vital.** Three honest notes:

1. **index mobile LCP rose 0.12s (2.03 → 2.15s).** Within run-to-run variance
   (observed range 1.82–2.15s) and still comfortably under 2.5s. Cause: a few
   more images now load during the initial window because dimensions are known.
2. **One CLS outlier of 0.124 appeared in 1 of 5 index runs** (median 0.030).
   Worth watching; the marquees are the likely source.
3. **Initial mobile bytes on `life-makers` varied 135–611 KB across runs** after
   the change, versus a stable 131 KB before — lazy-load threshold behaviour
   shifts once real dimensions exist. The full-scroll number (−74.5%) is the
   one that reflects the user's actual experience.

### Visual regression: proven, not asserted

Full-page screenshots at 390px and 1440px, before vs after, pixel-diffed:

| Shot | Size match | Diff |
|---|---|---|
| project-life-makers-unhcr 390 / 1440 | yes | **0.000%** |
| project-ilo-ssc 390 / 1440 | yes | **0.000%** |
| about 390 / 1440 | yes | 0.014% / 0.016% |
| index 390 / 1440 | yes | 0.053% / 0.076% |
| projects 390 / 1440 | yes | 0.070% / 0.157% |

A same-code control run measured a **2.353% noise floor on index-1440** (two CSS
marquees plus a JS parallax freeze at different positions), so every delta above
is at or below noise. Remaining sub-0.2% differences are AVIF re-encoding, which
is imperceptible. **Zero layout change, zero copy change.**

### Two real bugs caught during verification

Both were found by the pixel-diff, not by assumption:

1. **Project galleries grew ~870px taller.** Adding `width`/`height` attributes
   made them *presentational hints* that set a literal CSS `height`, overriding
   the `aspect-ratio` sizing. Fixed with `img { height: auto; }`.
2. **`<source>` elements became grid items.** `picture { display: contents }`
   promotes children to grid items, and `<source>` has no UA `display: none`, so
   each claimed a grid cell (7 images + 14 sources → images on 7 separate rows;
   7x248 + 10 gaps x18 = 1916px, matching the observed height exactly). Fixed
   with `picture > source { display: none; }`.

### What was deliberately NOT done

**The logo marquee is still broken.** The fix is one line — remove
`loading="lazy"` — and I applied it, measured it, and **reverted it**:

| | LCP (index, mobile) | Logos loading |
|---|---|---|
| Logos lazy (shipped) | **2.15s — PASS** | 4/50 (broken) |
| Logos eager (reverted) | **2.94s — FAIL** | 51/55 (working) |

Making 50 logos eager adds ~194 KB up front; at 205 KB/s that is ~0.95s, which
matches the observed +0.91s LCP regression almost exactly. `fetchpriority="low"`
did not help — the cost is raw bandwidth, not request ordering.

**The call:** the blank logo strip is a *pre-existing* bug, while a failing LCP
would be a *newly introduced* regression on the exact metric you asked me to
fix. I did not trade your headline number for a cosmetic bug. The proper fix
needs JavaScript (below), which is outside this tier's "no restyling, markup and
formats only" scope.

**Recommended follow-up (~10 lines, not applied):** attach an
`IntersectionObserver` to the `.logo-slider` *section*; when it nears the
viewport, flip every `.logo-slot img` to `loading="eager"`. Logos then cost
nothing at page load and load reliably when actually approached. At 296px AVIF
they are ~150 KB total instead of 3,081 KB.

---

## 7. Still failing? Escalation options

**Nothing is failing.** All six page/device combinations pass all four Core Web
Vitals. Ranked for when the portfolio grows:

| Plan | What | Cost | Trade-off |
|---|---|---|---|
| **B — GitHub Action** | Generate AVIF/WebP + widths on every commit | ~1 day setup, free CI minutes | Removes the manual regeneration step; adds a build dependency to a currently zero-build repo |
| **C — Image CDN** | Cloudflare Images / imgix / Bunny; Pages still serves HTML | $5–20/mo | **Only way to fix the `max-age=600` cache ceiling**; adds a third-party dependency and a monthly bill |
| **D — LQIP / blur-up** | Tiny blurred placeholder that sharpens | ~half a day | Improves *perceived* speed where bytes cannot shrink further; adds markup complexity |
| **E — Paginate galleries** | Fewer photos per project page | ~half a day | Cuts bytes directly, but reduces how much work each case study shows — a portfolio cost, not just technical |

**Recommendation: Plan B**, and only when you add a third project's worth of
photos. Right now every page passes on Slow 4G, so a build pipeline would be
solving a problem you do not yet have. The one thing worth doing sooner is the
**10-line logo `IntersectionObserver` fix** above — it repairs a visible bug at
essentially zero performance cost.

---

## 8. What changed, in plain English

**`<picture>` with AVIF and WebP.** An `<img>` gives the browser one file, take
it or leave it. A `<picture>` offers a menu: "AVIF if you can read it, otherwise
WebP, otherwise the original JPEG." AVIF and WebP are newer compression formats
that store the same photo in far fewer bytes. The browser silently picks the
best one it understands, so nobody sees a broken image — measured: **157 images
now served as AVIF**.

**`srcset` and `sizes`.** Previously one 1600px-wide photo went to every visitor,
including a phone displaying it 441px wide — roughly 3.6x more pixels than the
screen can show. `srcset` lists several sizes and `sizes` tells the browser how
big the photo will actually appear, so a phone downloads the small one and a
desktop the large one.

**`width` and `height` attributes.** Without them the browser does not know how
tall a photo will be until it arrives, so text jumps around as images pop in
(this is CLS). With them the browser reserves the exact space in advance. The
`img { height: auto; }` line is the required companion — without it those
attributes force a literal pixel height and break the aspect ratio (which is
exactly the bug caught in §6).

**`loading="lazy"` vs eager.** Lazy means "don't download until the visitor
scrolls near it." Correct for below-fold images, wrong for above-fold ones
(3 were wrong in each direction, now corrected).

**`decoding="async"`.** Even after a photo downloads, the browser must decode it
into pixels. By default that can happen on the main thread and freeze the page
briefly. `async` moves it aside so scrolling stays smooth.

**`fetchpriority="high"` + `<link rel="preload">` on the hero.** Tells the
browser "this is the important one, start it first" — it is the LCP element,
so it directly sets the headline score.

**Full-size lightbox versions.** Gallery thumbnails now carry a display-sized
882px file. Clicking one used to open that same file blown up full-screen, which
would look soft — so each gallery image gained a `data-full` attribute pointing
at a full-resolution WebP that the lightbox opens instead (76 generated, 6.3 MB
smaller than the originals they replace).

---

## 9. Rollback

Every change is in **one commit**. To revert everything:

```bash
git revert <commit-sha>
```

To revert selectively:

| To undo | Command |
|---|---|
| Markup only (keep new image files) | `git checkout <commit-sha>~1 -- '*.html'` |
| CSS only (`height:auto`, `picture` rules) | `git checkout <commit-sha>~1 -- css/style.css` |
| Lightbox JS only | `git checkout <commit-sha>~1 -- js/main.js` |
| Everything, discarding the commit | `git reset --hard <commit-sha>~1` |

**Nothing was destroyed.** All 129 pristine originals are committed at
`assets/originals/` (20.15 MB), byte-for-byte identical to what was there
before, and they also remain in git history at commit `61df962` and earlier. The
123 originals removed from `images/` were only removed *after* verifying each one
was archived; recover any of them with:

```bash
git checkout 61df962 -- images/projects/life-makers-unhcr/photo-7.jpg
```

**Repo size note:** tracked images went from ~20 MB to **55 MB** — the originals
archive (20 MB) plus derivatives (13 MB) plus full-size lightbox WebP (8 MB).
Well within GitHub Pages' 1 GB limit, but if you would rather keep the repo lean,
add `assets/originals/` to `.gitignore` and `git rm -r --cached assets/originals`
— the originals stay on your disk and in git history, and the deployed site never
references them.

---

## 10. Reproducing this audit

| Script | Purpose |
|---|---|
| `measure.py` | CDP harness, Lighthouse throttling, LCP/CLS/TBT/bytes |
| `scroll_measure.py` | The scroll test — the one that found the real problem |
| `forensics.py` | Per-image table; savings by real re-encoding |
| `responsive.py` | 6-breakpoint checks |
| `shots.py` + `diffshots.py` | Visual-regression proof with a noise-floor control |
| `gen_derivatives.py` | Generates AVIF/WebP/fallback variants |
| `rewrite_html.py` | `<img>` → `<picture>` conversion |

Requires `pip install --user websocket-client pillow-avif-plugin` (both installed
at user level; uninstall with `pip uninstall`).

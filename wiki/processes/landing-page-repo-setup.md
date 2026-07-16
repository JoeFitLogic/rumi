---
type: process
name: Landing Page Repo — Setup & Build SOP
status: active
created: 2026-07-16
related:
  - wiki/products/landing-pages.md
  - wiki/processes/landing-page-delivery.md
---

# Landing Page Repo — Setup & Build SOP

One GitHub repo, one branch per page. You write the copy; the design skills
build it. Output = a self-contained HTML block you paste into GHL.

---

## Part A — One-time repo setup

Do this once. After that, every page is just Part B.

1. **Create the repo** on GitHub — private, name it `landing-pages` (one repo for
   all clients). README + default branch `main`.

2. **Add the design skills to the repo.** Commit them so every Claude Code web
   session has them with no network install (the impeccable installer's CDN is
   blocked on web — committing is the reliable path).
   - Copy `.claude/skills/` and `.claude/agents/` from the `rumi` repo into the
     new repo, OR re-run the installers locally on the Windows laptop.
   - Skills you want: `impeccable`, `ui-ux-pro-max`, `ui-styling`,
     `design-system`, `brand`, `playwright-cli`.

3. **Add a `CLAUDE.md`** at the repo root (template in the Appendix). This is what
   makes every page come out GHL-ready without re-explaining the rules each time.

4. **Folder layout:**
   ```
   landing-pages/
   ├── CLAUDE.md
   ├── .claude/skills/          ← committed design skills
   ├── _template/               ← starter page + copy.md skeleton
   └── pages/
       └── <client>-<offer>/    ← one folder per page
           ├── copy.md          ← YOUR written copy goes here
           ├── brand.md         ← colours, logo, IG, font notes
           └── index.html       ← the built, self-contained page
   ```

5. Commit to `main`, push. Repo is now reusable forever.

---

## Part B — Build a page (repeat per offer)

This is the loop you run every time. Example: BFC low-ticket offer.

1. **Start a branch.** New Claude Code web session on the repo → it creates a
   branch (e.g. `page/bfc-low-ticket`), same as you do now.

2. **Drop in the inputs.** Create `pages/bfc-low-ticket/`:
   - `copy.md` — paste your finished copy (headlines, sections, CTA text, price).
   - `brand.md` — BFC colours (hex), logo, Instagram handle, any font preference.

3. **Build.** Tell Claude:
   > "Craft `pages/bfc-low-ticket/index.html` from copy.md and brand.md. Buy-now
   > landing page, self-contained HTML for a GHL block. Follow CLAUDE.md."

   This runs `/impeccable craft` against your copy — no invented content, design
   only.

4. **Review + polish.** `/impeccable audit` (contrast, hierarchy, anti-patterns) →
   `/impeccable polish` (motion, spacing). Verify with `playwright-cli` — screenshot
   **mobile first** (BFC traffic is mostly mobile), then desktop.

5. **Commit + push the branch.** Merge to `main` when happy — `main` becomes your
   library of every page you've built.

---

## Part C — Ship to GHL

1. Open `index.html`, copy the whole thing.
2. In GHL: add a **Custom HTML / Code** element to the page, paste it in.
3. Wire the **buy-now CTA** → your GHL checkout/order-form URL (the page uses a
   `{{CHECKOUT_URL}}` placeholder — find/replace it).
4. If capturing details too, drop the **GHL form embed** into the marked slot.
5. **Test live:** load on a phone, click buy, confirm checkout opens and (if used)
   a lead lands in GHL.

---

## Appendix — CLAUDE.md for the landing-pages repo

Paste this into the new repo's root `CLAUDE.md`. It's what makes output
GHL-safe every time.

```markdown
# Landing Pages Repo

Build self-contained landing pages that get pasted into GoHighLevel HTML blocks.

## Non-negotiable build rules
- **One self-contained file.** All CSS and JS inline in `index.html`. No build
  step, no framework, no external JS bundles.
- **Namespace everything.** Wrap the whole page in a unique root, e.g.
  `<div class="lp-<client>-<offer>">`, and scope ALL CSS under that class. GHL
  injects global styles into HTML blocks — unscoped CSS will be mangled and will
  leak into GHL's own UI. Never style bare tags (`h1`, `p`, `button`) globally.
- **Mobile-first.** Most traffic is mobile. Design and verify mobile before desktop.
- **Copy is provided.** Never invent claims, prices, or testimonials. Use only
  what's in `copy.md`. If copy is missing, ask — don't fill.
- **CTA destination.** Buy-now buttons link to `{{CHECKOUT_URL}}` (a placeholder
  Joe swaps in GHL). Leave a clearly-commented `<!-- GHL FORM EMBED SLOT -->` if a
  form is needed.
- **Fonts.** Prefer a system font stack or a single Google Fonts `@import` inlined
  in the `<style>`. No large font bundles.
- **Accessibility.** Body text ≥4.5:1 contrast. Respect `prefers-reduced-motion`.

## Design quality
- Use the `impeccable` skill for craft/audit/polish. It bans the AI tells
  (gradient text, identical card grids, cream backgrounds, per-section eyebrows).
- Pull palettes/type/patterns from `ui-ux-pro-max`.
- Match the client's brand from `brand.md`, not a generic default.

## Output
Deliverable is `pages/<client>-<offer>/index.html` — copy-paste ready for a GHL
HTML block.
```

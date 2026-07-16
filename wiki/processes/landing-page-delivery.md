---
type: process
name: Landing Page Delivery SOP
status: active
created: 2026-07-16
related: wiki/products/landing-pages.md
---

# Landing Page Delivery SOP

Repeatable build for a client landing page + CRM connection. Goal: page live and
leads flowing into GHL, fast. Skill triggers in `bold`.

## 0. Intake (15 min)

Get three things from the client. Nothing else blocks the build:
- **The one goal** — book a call / buy / join a list. One, not three.
- **The offer** — what they're selling and to whom.
- **Their brand** — logo, colours, any existing site. If none, we pick.

## 1. Seed context

- Spin up a fresh Next.js repo (or reuse the client template).
- Run `/impeccable init` → captures offer, audience, goal into `PRODUCT.md`.
- Use the **brand** skill to lock the *client's* identity (their colours/voice,
  not FitLogic's). If they have no brand, **impeccable** picks a palette.

## 2. Build

- `/impeccable craft` → builds the page. Real responsive code, committed design
  choices, AI tells banned.
- Pull references from **ui-ux-pro-max** (styles/palettes/font pairings) and
  **ui-styling** (shadcn/Tailwind) as needed.

## 3. The form → CRM connection (THE recurring value)

This is the bit that makes it a system, not a leak. Pick one:

- **Path A — GHL native embed (simplest):** Create the form/survey in GHL, embed
  the iframe on the page. Leads land in GHL automatically. Best for £99/mo clients.
- **Path B — Custom form → GHL webhook (best UX):** Build a custom-styled form on
  the page, POST submissions to a GHL **Inbound Webhook** (or the Contacts API).
  Keeps the page's design integrity, still lands every lead in GHL.
- **Path C — Full GHL funnel:** Rebuild the page as a GHL funnel page. Host lives
  entirely in GHL. Best for £750/mo full-system clients.

In GHL, wire the lead into: correct **pipeline stage**, tags, and a follow-up
automation (at minimum: instant confirmation + notify the client).

## 4. Self-review

- `/impeccable audit` → runs the 46 detector rules (contrast, hierarchy,
  anti-patterns). Fix everything it flags.
- `/impeccable polish` → final craft pass: motion, spacing rhythm, micro-interactions.
- Verify in a real browser with **playwright-cli** — screenshot mobile + desktop.
  Joe's clients' traffic is mostly mobile; check mobile first.

## 5. Ship

- Deploy to Vercel (custom domain) — or publish the GHL funnel (Path C).
- **Test the form end to end:** submit a real entry, confirm it lands in GHL and
  the automation fires. A page that ships with a broken form is worse than no page.

## 6. Handover + upsell

- Walk them through the live page.
- Run the close script (`wiki/products/landing-pages.md`): "Where do these leads
  go?" → £99/mo host+connect, or £750/mo full system.

## Definition of done

- [ ] Page live on a real domain, mobile + desktop verified
- [ ] Form submits and lands in GHL (tested with a real entry)
- [ ] Lead routes to the right pipeline stage + a follow-up fires
- [ ] Client walked through it and offered a recurring tier

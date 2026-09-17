# Shardlane platform design

## Landing technical audit remediation

The workflow cards now use content-driven height with the footer in normal flex flow. The 420px desktop and 480px narrow-screen dimensions are minimums, not clipping boundaries; increased text spacing can grow the card without covering its action. Secondary links, announcement, and footer marks have at least 44px hit areas. The workspace screenshot uses native lazy loading and async decoding, so opening the disclosure triggers its request rather than paying for it on initial load. The mobile menu’s Sign in route and keyboard/Escape behavior were already restored by the header redesign and remain covered.

Run `INVOICE_TEST_BASE_URL=http://localhost:4392 vp run platform:audit:test` against a running preview. This regression failed against the pre-fix build for eager loading, small targets, and workflow overlap. It checks the corrected behavior at 320, 390, 768, and 1800px, including all workflow panels with WCAG text-spacing overrides. Existing interaction checks use a minimum height instead of enforcing a fixed card size.

## Animated invoice flow and live controls (current authority)

The ownership tabs and stepped proof rows have been replaced by a connected invoice composition, inspired by Autumn’s live customer-record section: business/client/line-item inputs feed one real example invoice and branch into PDF, JSON, and local-draft outputs. The section is unframed on the existing black surface; its 40px grid is intentional fidelity to the explicitly requested flow reference. Desktop connections run horizontally; below 760px they run vertically. Connector geometry follows actual DOM bounds, including resized text. The file sheets borrow the folded-document and format-badge idea from [Urmauur’s collection](https://www.urmauur.com/interfaces/file-card-collections); its registry is public but no source license was verified, so the collection source/assets were not copied.

Output buttons work with pointer and keyboard, select the central preview, and expose a real action. JSON downloads the complete schema-valid example, PDF opens the full printable document, and local draft opens the editor. The example is not silently saved or uploaded. Light/dark paper remains available. Motion 13 draws the connections once in view and on deliberate selection/replay, finishing in under two seconds rather than looping. Reduced motion shows static connections and disables replay. Calligraph 1.4.1 handles format and hero-copy text changes; Torph 0.1.3 handles output status continuity. Server and first-client markup stay identical; one plain text copy remains available to assistive technology while animated character layers are hidden.

The header preserves its fixed 62px frame, 16px top rail, 44px row, 14px Berkeley Mono links, and mobile disclosure. Morphicons 1.7.1 uses the public `maskTarget` adapter with Lucide icon data for hover/focus arrows and Menu/X continuity. SSR icons remain until masks initialize. Reduced motion is explicitly enabled, and navigation tears down masks/listeners. Dither feedback on header and feature glyph surfaces is a narrow token-based adaptation of [Dither Kit’s ordered-Bayer button algorithm](https://github.com/Boring-Software-Inc/dither-kit/blob/main/registry/dither-kit/button.tsx), not a nonexistent logo package. Its repository declares MIT; attribution is retained in the adapter. Only Canvas 2D, resize observation, and bounded interaction frames are used—no chart core, bloom, extra palette, or Tailwind component system. The native links, focus rings, accessible names, and icons remain intact.

The nine feature cards retain their facts, adopt the attached blue/burgundy, green/violet, amber/charcoal grid artwork direction, and link to real routes. Their artwork is now generated with `openai/gpt-image-2.5-sunburst` through Replicate, using the user's approved token without exposing credentials. Each glyph uses a transparent background over the existing CSS grid. The grid is intentional reference fidelity, not an accidental decorative default. No Autumn video or proprietary logo is copied. Local 320×320 WebP assets live in `invoice/public/images/features/`; lazy loading, explicit dimensions, and empty alt text preserve performance and avoid repeating adjacent feature labels. Original generations, prompts, and prediction receipts remain in session artifacts.

`INVOICE_TEST_BASE_URL=http://localhost:4391 npx tsx scripts/check-section-redesign.ts` checks header geometry, mobile account access, keyboard format selection, paper modes, flow replay, JSON download, responsive layout, text-spacing overrides, hover/reduced-motion feedback, and axe-core. Earlier hero/editor regression commands remain applicable. Scoped component styles reuse `theme.css` tokens; superseded public feature and file-tree rules are removed.

## Previous hero and interaction correction

The latest pass preserves the shared Stisla system, routes, forms, storage, and print contracts while replacing the simplified hero and static product block. Design read: developer-tool presentation for independent invoice users; fidelity 9/10, density 6/10, motion 3/10, visual variance 4/10, asset dependence 6/10. The user's screenshots and live Autumn containers—not a new theme—remain the reference.

Live browser measurements at 1800 × 1080: hero frame x=180/y=109, left heading x=271/y=305, two 720px columns, 525px minimum stage, and 56px/56px heading. The arbitrary 64px heading translation is removed. The right column now contains a real 520px terminal with status dots, filename boundary, syntax colors, and a working copy action. It copies the complete schema-validated fictional invoice, not the displayed excerpt. Clipboard denial produces an error state. Below 1280px the full terminal is hidden, as in the live reference; mobile headings use 44px and the next section remains visible.

The product section adapts the observed story accordion into honest Create / Review / Keep workflows: a 420px desktop track, 12px gaps, and two 80px selectors. Clicking, Enter/Space, arrow keys, Home, and End select panels. Inactive content is hidden from both focus and accessibility trees. Unlike Autumn's cyclic reordering, selectors retain their logical order. Below 1024px they stack; mobile uses a 480px expanded panel to prevent copy/footer collisions. The original application screenshot remains accessible in the workspace disclosure.

Colors extend the existing token file: #0f0f0f stage, green/orange/violet workflow colors sampled from the reference direction, accessible syntax colors, and window dots. Dot texture and corner brackets delineate the colored panels. Overlays are darker than the reference's 30%/20% treatment to keep text readable; hover still visibly brightens them. Existing fonts, icons, square Stisla buttons, section rails, and feature-grid boundaries remain in use. No customer logos, branded video, invented testimonials, or new external assets are shipped.

Motion's local skill and documentation search were used, along with public layout, gesture, and reduced-motion documentation. Adding the Motion runtime package was denied in this earlier pass; that restriction was subsequently lifted, and the current flow uses Motion as documented above. Native CSS supplies interruptible 320ms desktop expansion, a short content fade, 160ms hover/press feedback, and reduced-motion overrides. The bounded three-panel desktop flex transition deliberately changes layout; fixed-width content prevents per-frame text reflow. A local Chromium switching sample recorded 37 frames, 16.6ms average / 16.8ms maximum intervals, with none over 34ms; this is a local check, not a universal device-performance claim. Mobile avoids height animation entirely. No gated Motion+ source or Dither Kit code was copied.

Run `npx tsx scripts/check-platform-interactions.ts` for copy success/failure, all panel states at eight widths, keyboard order, rapid switching, press/hover states, reduced motion, and content clipping/overlap checks. `npm run platform:visual:test` covers screenshot geometry and axe-core at six sizes. Browser guest and authenticated-editor regressions remain separate.

## Earlier screenshot-led foundation

The user rejected the original light/green interpretation. The images in `docs/design-spec/target/` now govern the visual direction. This is a visual overhaul with preserved routes, local-storage keys, forms, calculations, authentication calls, and print document contracts.

The target uses black outer gutters, #121212 section surfaces, #090909 recessed tools, #363636 structural lines, #ededed primary text, #aeaeae secondary text, and #a080f8 square actions. These values override the existing Stisla semantic tokens in `invoice/theme.css`, imported by both public and application styles. There is no separate public palette or duplicate font registry. Berkeley Mono labels and local Hyperlegible text remain the supplied, licensed font choices.

At the reference's 1800 × 1080 CSS viewport, the frame begins at x=180, inner content at x≈270, and the 56px hero heading at y≈314. The implementation measures x=180, x=270.875, y=314.266. Desktop features use a three-column structural grid, tablet two columns, and mobile one. Mobile omits the nonessential JSON sample body and keeps the following section visible. No screenshot supplies a mobile composition or app dashboard; responsive stacking and shared dark workspace styling are the minimal inferred adaptations.

The landing composition follows the provided hero, section rails, asymmetric workflow section, nine-item feature grid, FAQ, and large sparse footer. Copy and product evidence describe Shardlane, not Autumn: no copied customer logos, fabricated endorsements, or unsupported billing features. The screenshot-sized code sample replaces Autumn's billing code; the evidence section uses a real screenshot of the invoice workspace.

Dither Kit's documented source, standalone avatar, native button, and dependency graph were inspected. Importing the source was declined by the tool permission boundary; a follow-up approval question could not be answered because the user was unavailable. Dither Kit was not integrated in that pass; the current adapter above supersedes this limitation. Existing installed icons/components remain in use; no replacement was falsely labeled Dither Kit.

Validation: `npm run platform:visual:test` checks all six viewports (1800×1080, 1440×900, 1280×720, 768×1024, 390×844, 360×800), reference-aligned geometry/colors, feature columns, mobile fold, runtime errors, axe-core, and live navigation/FAQ/appearance interactions. It writes screenshots, a side-by-side reference comparison, and measured JSON to the reported temporary evidence directory. The target images must be available locally to run it. `npm run platform:test` separately covers persistent editor workflows and corrupt-storage recovery.

The earlier strategy below records product decisions; its original light visual proposal is superseded by this section.

## Brand decisions and discovery

Confirmed name: **Shardlane**. The requested five-question discovery was started, but the user was unavailable after the naming and audience questions. These are the questions and provisional answers, not attributed user decisions:

1. What should the platform be called? **Shardlane**, confirmed by the user.
2. Who should it serve first? Freelancers and independent consultants; small businesses remain supported.
3. What is the primary offer? Free, account-optional browser invoice creation with portable exports.
4. What should the brand feel like? Quiet, exact, trustworthy, and open rather than playful or corporate.
5. Which visual direction should lead? The user subsequently supplied the authoritative dark screenshots; the screenshot-led correction above replaces the provisional light proposal.

## Exact page structure

| Route | Structure and purpose |
| --- | --- |
| `/` | Navigation → Shardlane name and literal invoice offer → create action and real product screenshot → three product capabilities → browser/cloud/self-hosted options → ownership and open source → FAQ → closing create action → license/footer. |
| `/create` | Navigation rail → breadcrumbs and storage status → invoice title/export actions → form and live A4 preview → persistence note. Invoices navigation opens a searchable table of browser drafts. |
| `/workspace` | Existing authenticated invoice library, creation/import, reusable business/client defaults, and saved records. |
| `/invoices/:id` | Existing revision-aware editor; Save, Issue, and immutable archived PDF remain distinct. |
| `/login` | Shardlane navigation → centered sign-in/sign-up form → guest alternative. Existing authentication endpoints are preserved. |
| `/template-preview` | Public fictional reference document and print action; no personal data. |

### Above the fold

The home page leads with the product name, invoice-generation offer, primary **Create an invoice** action, source link, and visible evidence of the actual interface. No fabricated logos, customer counts, star counts, payment integrations, or testimonials. The editor leads with the task, draft status, exports, editable fields, and preview—not marketing.

### Sections template sites skip

State where data lives, how it can leave, and what does not happen automatically. Distinguish browser drafts from account-backed server records. Include export portability, source/license access, self-hosting, and the limitations of browser print and local storage. Do not disguise demo records as real business activity.

### Premium layout decisions

Use one shared spacing rhythm (4, 8, 12, 16, 24, 32, 48), aligned financial columns, modest 4–8px tool radii, and no floating cards around page sections. A 224px navigation rail and stable two-column workbench support repeated work. Small screens stack the editor and preview; the document retains its print dimensions and gets a screen-only scale. The 16px/12px/4px reference describes a radius relationship rather than requiring oversized rounding everywhere. Keep the document contract separate from app typography.

### The one DIY mistake

**Inconsistent visual rules.** When every section invents a different gap, radius, type scale, and button treatment, even expensive assets look assembled. Use fewer rules and apply them consistently.

## Evidence and implementation

- `dembrandt https://useautumn.com/ --json-only` succeeded. It extracted 6 colors, 58 type styles, 20 spacing values, one observed radius, 18 border combinations, and 6 motion durations. Raw extraction is a session artifact, not a brand asset copied into the product.
- Browser inspection observed Geist 56px hero type, 16px body text, 12px mono navigation, square buttons, neutral backgrounds, and purple primary actions. Shardlane now follows the supplied dark/lavender reference styling without copying Autumn's brand identity or customer claims.
- AstroDeck's components → sections → pages organization is used for the public site; existing domain/application/server boundaries are preserved.
- The ai-website-cloner-template reconnaissance → foundation → assembly → QA approach informed reference inspection. Its Next.js scaffold was not copied into this existing Astro app.
- Actual `@stisla/style` tokens and button/table styles remain installed. `theme.css` owns the shared reference palette; `platform.css` owns scoped workspace layout without changing invoice document tokens.
- Berkeley Mono is the supplied local font. Hyperlegible Sans regular and bold are local, with the upstream SIL Open Font License retained. Lastik is not bundled because no licensed font file was supplied.
- Hugeicons was requested, but the package/version addition was declined during execution. Existing installed Oxide icons are retained rather than bypassing that decision.
- `docs/references/dialkit.md` was read. A developer tuning panel is not shipped to invoice users.
- Canvas UI was inspected: it is a WebGL/WebGPU effects library, not a document editor. Its Commons Clause and experimental rendering make it unsuitable for this print-first financial workspace. No dependency was added.
- Bloub was inspected: it recreates the x.ai bot avatar and is not a general user-avatar component. Shardlane uses neutral workspace initials instead of copying a different company's character.
- Transitions.dev source guidance was read through `gh`; use short named feedback duration and reduced-motion fallback. No global skill installer was executed.
- No file-card asset collection was copied without licensing verification.
- `axe-core` is a declared development dependency for browser accessibility checks.

## Product shots

The shipped product shot remains an actual browser screenshot with fictional example data, so it accurately represents the product. Earlier work used GPT Image 2 in advisor mode. In the artwork fork, the user supplied Replicate access and nine feature glyphs were generated with GPT Image 2.5 Sunburst; these are symbolic illustrations, not product screenshots. Riverflow was not needed. Generation is an offline asset-production step: the application has no Replicate dependency, token, or runtime API calls.

Optional GPT Image 2 art direction: “A precise, front-facing editorial product photograph of an A4 invoice on clean white paper, fine terminal-style dashed rules, small blue bracket labels, graphite monospaced typography, ample negative space, subtle natural side lighting, white-neutral background, no perspective distortion, no extra branding, no fabricated dashboard metrics. Keep the full invoice visible. Use only fictional business details. 3:2 crop, restrained professional financial software campaign.” This is supplementary art direction, not an asset dependency.

## Behavior and limitations

Guest drafts use `shardlane:local:v1`, separate from historical and account recovery keys. A blank invoice is created on first use. Example data is opt-in. Valid edits persist locally; malformed edits retain the last valid preview and draft. Corrupt libraries are preserved until explicit recovery/reset, and a 100-record bound fails visibly instead of dropping records. JSON imports add a separate invoice. Browser export uses the print dialog; users choose Save as PDF and the document appearance. It does not issue a legal immutable server invoice.

Guest data is not automatically uploaded or synchronized on sign-in. Import its exported JSON in the authenticated workspace. Cloud accounts, server issuance, and archived PDFs still require the repository's existing authentication, database, and storage configuration. No email, recurring billing, or payment collection is claimed or introduced.

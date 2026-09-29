<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Stack

- **Framework**: Astro (Multi-framework)
- **Backend**: Neon(Auth, Database)

## Code Style

- **TypeScript everywhere** — Use TypeScript for new files. Avoid any — prefer unknown and narrow.
- Run vp lint --fix before committing. Never disable rules without a comment explaining why.
- **Prettier formatting** — Auto-format on save. Don't hand-format.
- **Naming conventions** — kebab-case files, PascalCase components, camelCase variables, SCREAMING_SNAKE for env vars.
- **Sorted imports** — Group external → internal → relative. Path aliases over deep relative imports.

## Testing

- **Vitest for unit tests** — Co-locate *.test.ts with the source file. Cover the happy path and at least one edge case.
- **Playwright for e2e** — E2E specs in tests/e2e. Run vp test:e2e.
::warning
e2e tests are not added yet, remove this warning section once added::
- **Accessibility checks** — Run automated a11y assertions on critical pages. Manual keyboard test before merging UI changes.
- **Avoid snapshot tests** — Snapshot tests rot. Prefer explicit assertions.
- **Tests with the change** — New behavior gets new tests in the same PR. Bug fixes include a regression test.
- Create and validate Postgres schema migrations. Use when adding or changing a migration, or reviewing its rollout.

### Testing instructions
- Find the CI plan in the .github/workflows folder.
- From the package root you can just call `vp test`. The commit should pass all tests before you merge.
- To focus on one step, add the Vitest pattern: `vp vitest run -t "<test name>"`.
- Fix any test or type errors until the whole suite is green.
- Add or update tests for the code you change, even if nobody asked.

---

## Interface Cheat Sheet

Practical tips for making your interfaces clearer, easier to use and more polished.

### User Interface

- When nesting elements, **make their border radius concentric**. The formula for the inner radius is: outer radius − gap between the elements.
- Prioritize **optical alignment** over **geometric alignment**.
- A button with text and an icon gets **slightly smaller padding on the side of the icon**.
- Use a layered `box-shadow` to give elements **depth** instead of using borders.
- Give images a `1px` outline, offset by `-1px`: black at `8%` opacity in light mode, white at `8%` in dark mode.
- Match the icon’s **stroke to the text next to it**.

### Animation

- Make elements **animate from the trigger** rather than the center. Set `transform-origin` based on the trigger’s position.
- For **menus people open often**, skip the opening animation and only animate when they close.
- Make **exit animations more subtle** than entrances. Move the element by a shorter distance as it fades out with `opacity` and a `4px` blur.
- Name the **exact properties** you want to animate in a transition. Never use `transition: all`.
- Make buttons **scale down slightly when pressed**. Use a scale between `0.95` and `0.98` with `transition: scale 200ms ease-out`.
- When icons swap, **fade one out as the other fades in**. Animate the new icon’s scale from `0.25` to `1`, opacity from `0` to `1` and blur from `4px` to `0px`. Reverse these for the old icon.
- Use CSS transitions for interactions so the animation **can change direction halfway through**. Use keyframes for sequences that only run once.
- **Disable all transitions** when switching between light and dark mode.
- If an element **randomly shifts by 1–2px while animating**, add `will-change: transform` to it. This is especially useful in Safari on iOS.
- When elements enter, **animate them in small groups** with a short delay between each group instead of animating one giant block.
- Prevent elements from **animating on page load**, unless it’s intentional.
- Keep frequent interactions **instant or very fast**, like an item changing color when you hover it.

### Typography

- Always use `.woff2` **font files** on the web, never `.ttf` or `.otf`.
- Use `font-variant-numeric: tabular-nums` in timers, counters, prices and tables. It gives every digit the same width which prevents layout shifts when the values change. Skip it if you’re already using a monospace font.
- Keep lines in articles and other long text to **60–75 characters**. Long form text that is wider than that is difficult to read.
- Use `text-wrap: balance` to **even out headings** and `text-wrap: pretty` on descriptions to prevent orphaned words. Use neither for long form text.
- Keep **long words, links and IDs inside their container** with `overflow-wrap: break-word`. Use `white-space: nowrap` to prevent labels and badges from wrapping.
- Set `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` **on the root layout** to make text appear sharper.
- Write text with **normal capitalization**. Use `text-transform` when you want to display it in uppercase or lowercase.
- Use **smart punctuation**: curly quotes, an en dash (–) for ranges, an em dash (—) for asides and an ellipsis (…) instead of three dots.
- Keep **underlines from crossing the tails of letters** like g and y. Use `text-underline-position: from-font` with `text-decoration-skip-ink: auto`.
- When you **shorten text with an ellipsis**, let people read the full text in a tooltip or an expanded view.

### Colors

- **Every step** in a color palette should have a purpose: page background, component hover, border, solid fill, body text. Don’t add steps that nothing uses.
- Components should use **semantic tokens** (`--color-text-secondary`), never primitives (`--blue-500`). The primitive is the raw value, the token is how the value is used.
- Name color tokens by **purpose**: `--color-accent-solid` instead of `--color-blue-button` or `--color-sidebar-gray`.
- Reserve `accent` **for the brand color** so `primary` never means both the brand and the main body text.
- Measure contrast against the background **directly behind an element**.
- Create a separate color palette **for dark mode** instead of inverting the light mode palette.
- Choose **one way to switch themes**: `prefers-color-scheme` or a `.dark` class. Don’t mix both.
- You can define **how colors blend** in a gradient. Use `in oklab` for even brightness, `in oklch` for more vivid colors in the middle or `in srgb` for more muted midtones.

### Accessibility

- Use **native HTML elements**: `<button>` for buttons and `<a>` for links, for example. Native elements already have a lot of accessibility and other expected behavior built in.
- Style `:focus-visible` instead of `:focus`. Don’t **remove the outline** without a replacement.
- Only use `tabindex="0"` and `tabindex="-1"`. **Positive values change the expected order** of the elements.
- Give **buttons that only have an icon** a descriptive `aria-label`. Never put `aria-hidden="true"` on an element that can be focused.
- Write **alternative text that explains the image’s purpose and what it shows**. Give decorative images `alt=""`.
- Give **every input a visible label** using `<label>`. Set its `type` and `inputmode` to match what people should enter.
- **Never block paste.** People paste in things like passwords and one-time codes.
- **Keep the submit button enabled** until the request starts. Check for errors when people submit. Mark invalid fields with `aria-invalid="true"`, connect each error message with `aria-describedby` and move focus to the first invalid field.
- Make **hit areas** at least `24x24px`. Aim for `44x44px` on touch screens and `40x40px` on desktop where possible. Make sure they never overlap.
- Use `pointer-events: none` on **decorative elements** like glows and gradients so events are never swallowed.
- Put hover styles inside `@media (hover: hover)`. On touch screens, `:hover` **stays active after a tap** and makes an item look selected.
- **Respect people’s reduced motion setting.** Put animations inside `@media (prefers-reduced-motion: no-preference)` so they only play for people who don’t have motion reduced.
- Use `role="status"` to **announce routine updates to screen readers**. Save `role="alert"` for urgent errors.
- **Never use color alone** to show a status change. Add an icon, a label or an underline too.
- Make the **skip-to-content link the first stop** when someone presses Tab.

### Layout

- Use `scroll-margin-top` to **leave space above headings** when people follow links to them.
- Leave **at least twice as much space between groups** as between items in a group. For example, use `8px` between items and `16px` or more between groups.

### Writing

- Start button labels with a **verb**: “Save draft” or “Delete project”, never “OK!” or a bare “Yes”.
- Make confirmation buttons **say what will happen**: “Delete project” next to “Cancel”.
- Use **the same label to move to the next step** throughout a flow. Choose “Continue” or “Next” and use it for every step.
- **Describe where a link goes**.
- Capitalize buttons, headings and labels **the same way everywhere**. Sentence case, like “Save changes”, is the safer default.
- Label toggles with **what happens when they’re on**: “Send read receipts”, not “Disable read receipts”.
- When a view is empty, **explain what belongs there** and give people one action to get started instead of nothing.
- Address the reader as **“you”**, not “the user”.

#### GUIDES
- FRONTEND_INSTRUCTIONS.md:  instructions for steering UI quality and avoiding common generated-UI defaults.
- INVOICE_DESIGN.md: Product design instructions
- docs/references/dialkit.md: instructions for working with dialkit

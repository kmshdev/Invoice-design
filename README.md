# Invoice Studio

A private invoice editor and authenticated backend-for-frontend (BFF), built with
Astro, React, PostgreSQL, and Better Auth. Draft editing, issuance, recovery, and
immutable PDF exports live in one application—not a publishable design-system fork.

## Quick start

Use Node 24.21.0 and npm 12.0.2 (pinned in `package.json`).

```sh
npm ci
npm run invoice:browser
npm run invoice:db
```

Keep the local database process running. In another terminal:

```sh
npm run invoice:migrate
npm run invoice:user
npm run dev
```

Open http://localhost:4321. User creation is interactive; there is no default login.
The database helper creates private local configuration only when absent. Do not
commit credentials or reuse the development database for production.

See [the runbook](invoice/USAGE.md) for configuration, PostgreSQL setup, account
provisioning, PDF requirements, and development/testing details.

## Architecture

- `invoice/domain/` and `invoice/model.ts`: invoice validation and calculations.
- `invoice/application/`: shared contracts, browser API client, and workspace state.
- `invoice/editor/` and `invoice/components/`: editor and printable document.
- `invoice/server/`: authentication, persistence, migrations, API handlers, and PDF rendering.
- `invoice/pages/`: thin Astro route adapters and page entry points.
- `scripts/`: local database, account, server, and verification commands.

The app consumes the pinned `@oxide/design-system` package through its public
`icons/react` export. Stisla supplies the existing theme/button/table styles; app-owned
CSS preserves the invoice's print contract. Do not copy upstream source into this
repository or add publishing, Figma export, palette-generation, or showcase pipelines.
BFF modules remain local source modules until a real second consumer needs packaging.

## Verification

```sh
npm run invoice:vale:install
npm run check:all
```

The acceptance gate runs lint/format/type checks, domain/client/server tests, template
prose checks, and built-server tests with real PostgreSQL, Chromium PDF rendering,
and editor browser workflows. Editor tests mock API responses to deterministically
exercise conflicts and recovery; server/PDF tests exercise the real API and database.
`npm test` is the faster suite; use `npm run invoice:server:test` for the explicit live
server/PDF/editor gate. To run editor browser checks against a running local dev server:

```sh
INVOICE_TEST_BASE_URL=http://localhost:4321 npm run invoice:editor:test
```

## Production build

```sh
npm run build
npm start
```

Configure the environment and apply migrations as described in the runbook first.
The server output is `dist-invoice/`; there is no npm release artifact. This package is
`private`, and CI never publishes canaries or requires registry publishing credentials.

## License

The repository retains the [Mozilla Public License 2.0](LICENSE) and attribution on
retained upstream-derived files. The installed design system carries its own notices.

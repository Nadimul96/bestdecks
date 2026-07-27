# Contributing to Bestdecks

Bestdecks welcomes focused fixes and documentation improvements while the first public release is being prepared.

## Before opening a change

1. Read the [README](./README.md), [release gate](./docs/release-readiness.md), and relevant [architecture decisions](./docs/adr/README.md).
2. Search existing issues and pull requests.
3. For a large architectural change, open a proposal issue before implementation.
4. Report security concerns through the private process in [SECURITY.md](./SECURITY.md), never through a public issue.

## Development setup

Use Node.js 24.18.0 and pnpm 11.7.0, as pinned by `.nvmrc` and `package.json`.

```bash
cp -n .env.example .env.local
pnpm install --frozen-lockfile
pnpm typecheck
```

Do not commit `.env.local`, database files, generated artifacts, provider responses, or credentials. Use dedicated test accounts and synthetic fixtures.

## Change discipline

- Keep each change narrow and reversible.
- Preserve unrelated and untracked work.
- Never manufacture quality, readiness, performance, customer, or outcome metrics.
- Mark illustrative UI and fixtures with the exact visible label `Sample data`.
- Treat `src/config/capabilities.ts` as the canonical public capability inventory.
- Use `Implemented` only for inspectable code paths.
- Use `Reference-verified` only when a controlled live receipt is checked in and reproducible.
- Keep cloud-only billing and operations outside the public core boundary described in ADR 0001.
- Add comments for constraints and non-obvious invariants, not line-by-line narration.

## Tests

Start with the narrowest test that proves the change:

```bash
node --import tsx --test path/to/focused.test.ts
pnpm typecheck
```

Run broader checks only when their state effects have been reviewed. Test cleanup must not target live user paths or assume an agent-created path is disposable.

Provider smoke commands make external requests and may incur cost. Run them only with explicit authorization, scoped credentials, and a documented expected receipt.

## Pull requests

Describe:

- the observed problem;
- the source evidence;
- the narrow change;
- checks actually run and their exact results;
- checks not run and why;
- user-visible or compatibility risks;
- documentation or capability metadata changed with the code.

Do not report a test, build, benchmark, or live behavior unless it actually ran.

By contributing, you agree that your contribution is licensed under Apache License 2.0.

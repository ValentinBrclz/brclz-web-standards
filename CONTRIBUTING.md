# Contributing

- Base changes on official documentation; cite the source in the pull request.
- Every new default, check or generator branch needs tests for success and failure.
- If generated output changes for an existing configuration, it is a breaking change
  ([versioning](docs/guide.md#versioning)); update `CHANGELOG.md`.
- After changing JSDoc types, run `npm run types` and commit `types/`.
- Commit messages and pull request titles follow Conventional Commits (`feat(cli): …`,
  `fix: …`, `build(deps): …`); CI lints the pull request title. Check a message locally with
  `printf '%s\n' "feat: add x" | npx --no-install commitlint`.
- `claude/rules/general.md` is the source of the shared rules block in both `AGENTS.md` files: edit
  it, run `npm run agents` and commit the result (`npm run verify` fails on drift).
- Keep permissive headers opt-in; never weaken a default without a recorded reason.
- Run `npm ci && npm run verify` (and `npm run test:smoke` when touching templates, the CLI or
  packaging) before requesting review.
- Never commit real site data, credentials or analytics identifiers; examples use example.com/org/net.

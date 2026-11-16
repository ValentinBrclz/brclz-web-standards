---
name: deploy-preflight
description: Pre-deployment checklist for the Cloudflare Workers Static Assets site. Only when the user asks to prepare a deployment; it never deploys.
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash(npm run verify) Bash(npm run build) Bash(npx brclz check *) Bash(npx brclz audit-dist *) Bash(npx wrangler deploy --dry-run *)
---

1. Run `npm run verify`, then `npx brclz check --strict` and
   `npx wrangler deploy --dry-run --outdir /tmp/wrangler-dry-run`.
2. Summarise what would change: Worker name, routes, `dist/_headers` and `dist/_redirects`.
3. List what to verify on the Preview URL with `curl -sI`: `X-Robots-Tag: noindex` on the
   Preview and absent in production, CSP, redirects, 404 status.
4. State the rollback: `wrangler rollback` or redeploying the previous version.
5. Stop. Deploying to production requires the user's explicit approval in this conversation.

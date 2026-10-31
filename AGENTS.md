<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Deployment workflow: GitHub only

- Production releases must go through the connected `ABDUGANIrich/Teech` GitHub repository and its `master` production branch. Follow [the README release workflow](README.md#deploy-through-github).
- When a release is authorized, run the appropriate checks, review and commit the complete intended changes, then push to GitHub. Let the existing Vercel Git integration build and publish the commit, and verify the resulting deployment and live behavior.
- Do not deploy the local working tree directly through the Vercel CLI or API, or manually promote deployments. Read-only Vercel inspection remains available for verification.
- This project-specific GitHub-only policy supersedes older deployment commands in skills, memories, and historical verification records.
- A documentation edit alone does not authorize a commit, push, or deployment.

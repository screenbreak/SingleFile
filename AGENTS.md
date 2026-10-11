# Screenbreak public extension: publication safety

This repository remains the public SingleFile fork. Preserve upstream history,
notices and licence obligations. All agents, including Claude and Codex, must
read this policy before publishing material to it.

## Intellectual-property boundary

- The public extension is a client. Proprietary server implementation, decision
  rules, calibrated weights, private evaluation datasets and scoring methods
  must not be copied or derived into this repository or its public artifacts.
- A filename, rename, minification, translation or feature flag does not establish
  that code is safe to publish. Code removed at the tip may remain in history.
- Review the exact destination and every pushed ref and newly reachable commit,
  tree, blob, commit/tag message, generated bundle, source map and packaged output.
  Review public PR descriptions, comments and uploads too. A credentials scan
  alone does not establish that intellectual property is absent.
- Public UI/assets, third-party dependencies and a generic local fallback must
  be explicitly classified through review. Do not assume copied layout code or
  tests are automatically public material.
- Before a public Git push, use the owner-provisioned private publication guard
  and a private review record bound to the exact content, destination and refs.
  It fails closed when that record is absent or stale. Preserve other installed
  guards and install it separately in every clone used by either bot.
- Do not bypass the guard using `--no-verify`, another clone/remote, an API or a
  browser. Hooks cannot intercept non-Git publication tools: agents must enforce
  the same review before those operations and hold unknown material.
- Report existing exposure privately to Nikos. Do not quote protected logic in
  public findings. Rewriting or purging published history requires his specific
  authorization for that scope; deletion cannot recall past disclosure.

## Development and acceptance

Verify repository root, remote, branch and working tree before editing; preserve
unrelated work. Use feature branches and reviewable PRs, with explicit destination
refs. Nikos controls integration, releases and the intellectual-property boundary.
A publication review does not accept a merge, Store submission or release.

Keep this repository separate from the application repository. Link the backend
issues/PRs and record compatible API and engine contract versions. Test both
local fallback and the approved isolated backend with synthetic/licensed inputs.
Never commit credentials, private runtime settings, customer content or protected
server implementation. Detailed audits and approval records remain private.

Policy/guard changes require a PR and actual validation results. Report which
local guards were installed and tested; written policy or CI is not enforcement
on another agent's computer.

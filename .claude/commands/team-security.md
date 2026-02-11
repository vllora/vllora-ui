Create an agent team to audit security across all layers of the Lucy Finetune Dataset feature. Focus: $ARGUMENTS

Each teammate MUST start by reading CLAUDE.md (cross-repo source map) and relevant docs in `docs/features/lucy-finetune-dataset/`.

## Full Architecture Layers (all teammates must understand this)
1. Agent Definition — `vllora/gateway/agents/finetune/vllora-finetune-agent.md`
2. Backend Gateway — `vllora/gateway/src/distri.rs`
3. Distri Server (Rust) — `/Users/anhthuduong/Documents/GitHub/distri/server/`
   - `distri-core/src/agent/orchestrator.rs`, `agent_loop.rs`, `tools/mod.rs`
   - `distri-core/src/a2a/handler.rs`, `a2a/stream.rs`
   - `distri-server/src/routes.rs`
4. Frontend — `src/components/datasets/LucyDatasetAssistant.tsx` + `src/lib/distri-finetune-tools/`
5. @distri/react & @distri/core — `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/`
6. Sync script — `scripts/sync-distrijs.sh`

## Teammates

**1. Frontend Security Auditor** — Audit the frontend code for client-side vulnerabilities. Check: XSS risks (dangerouslySetInnerHTML, unescaped user input in JSX, innerHTML usage), injection in tool parameters passed to the agent, localStorage exposure (sensitive data stored unencrypted), CSRF protections, open redirects, postMessage handling, eval() or Function() usage, unsafe regex patterns. Review how chat messages and tool results are rendered — are they sanitized before display? Check the @distri/react renderers (MessageRenderer, ToolExecutionRenderer) for XSS. Produce a report with: vulnerability type, severity (critical/high/medium/low), file:line, and remediation.

**2. API & Network Security Auditor** — Audit API communication patterns across all layers. Check: are API keys transmitted securely (HTTPS, not in URLs/query params)? Is the A2A protocol authenticated? Can an attacker forge tool calls or A2A messages? Are CORS headers properly configured on the gateway? Is input validation happening on the server side (distri.rs, distri-server routes) or only on the client? Are there rate limits? Can the agent definition be tampered with? Check the curl patterns in the codebase — are credentials exposed in logs? Produce a report with: attack vector, severity, affected layer, and remediation.

**3. Dependency & Supply Chain Auditor** — Audit dependencies for known vulnerabilities. Run `npm audit` in this repo. Check: are there known CVEs in direct or transitive dependencies? Is the vendored @distri/react/@distri/core up to date? Does `scripts/sync-distrijs.sh` verify integrity of synced packages (checksums, signatures)? Are there any dependencies with suspicious maintainers or low download counts? Check `package.json` and `package-lock.json` for pinning strategy (exact versions vs ranges). Produce a report with: vulnerable packages, CVE IDs, severity, and upgrade paths.

**4. Secrets & Data Exposure Auditor** — Scan the codebase for leaked secrets and sensitive data exposure. Check: hardcoded API keys, tokens, or passwords in source code, config files, or environment files. Check `.env`, `.env.*` files for sensitive values. Check git history for accidentally committed secrets (use `git log --all -p -- '*.env*'` and similar). Check if IndexedDB data (workflow state, dataset contents) contains sensitive information that should be encrypted. Check if error messages or console logs leak internal details. Produce a report with: what was found, where, severity, and remediation.

## Coordination rules
- All 4 teammates start in parallel — no dependencies
- Use delegate mode — lead coordinates only
- Each teammate produces a structured report with: findings, OWASP category (if applicable), severity (critical/high/medium/low), file:line references, attack scenario, and remediation steps
- Lead synthesizes all reports into a final security audit with: executive summary, critical findings (fix immediately), high findings (fix soon), medium/low findings (track), and a remediation priority list
- If any CRITICAL severity issue is found, lead should flag it prominently at the top of the synthesis
- Changes needed in the distri repo or gateway repo should be clearly marked

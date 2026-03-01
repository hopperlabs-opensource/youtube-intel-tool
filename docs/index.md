# Docs Home
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- Start with `pnpm run setup`, then verify with `pnpm run doctor` and `pnpm yit health`.
- Use this index to jump to quickstart, runbooks, API/CLI references, and governance.
- This project is local-first; public internet exposure requires hardening.

<div class="yit-hero">
  <h1>YouTube Intel Tool</h1>
  <p>Turn long YouTube videos into a local, time-indexed research surface with transcript search, entities, grounded chat, and operational observability.</p>
</div>

<div class="support-hero">
  <p class="support-eyebrow">Connect and Support</p>
  <h2>Official channels, status, and safe support paths</h2>
  <p>Use the Connect page as the source of truth for live channels. If a channel is marked "Coming Soon", treat similarly named accounts as unofficial.</p>
  <div class="cta-row">
    <a class="md-button md-button--primary" href="CONNECT/">Open Connect &amp; Support</a>
    <a class="md-button" href="https://github.com/hopperlabs-opensource/youtube-intel-tool/discussions">GitHub Discussions</a>
  </div>
</div>

<div class="yit-grid">
  <div class="yit-card">
    <strong>Local First</strong>
    Designed for local/self-hosted usage with explicit security boundaries.
  </div>
  <div class="yit-card">
    <strong>SDK + CLI</strong>
    Use the web UI, the <code>yit</code> CLI, or the TypeScript SDK against the same contract.
  </div>
  <div class="yit-card">
    <strong>Ops Included</strong>
    Built-in runbooks, health checks, release checks, and secret scanning workflows.
  </div>
</div>

## Start Fast

=== "Human"

    ```bash
    pnpm run setup
    pnpm run doctor
    pnpm yit health
    ```

    Then open `http://localhost:<YIT_WEB_PORT>` (default `48333`).

=== "Agentic"

    Use your preferred agentic CLI in repo root with:

    ```text
    Read docs/GETTING_STARTED.md and docs/RUNBOOKS.md.
    Bring up the stack locally, verify health, and ingest one URL.
    ```

## Documentation Paths

- Community channels and support: [Connect & Support](CONNECT.md)
- Start fast: [Quick Start](QUICKSTART.md)
- New here: [Getting Started](GETTING_STARTED.md)
- Operating the stack: [Runbooks](RUNBOOKS.md)
- Karaoke app workflow: [Karaoke Mode](KARAOKE.md)
- Integration: [CLI](CLI.md) and [API](API.md)
- Project policy: [Governance](GOVERNANCE.md)
- Docs standards: [GitHub Docs Style Guide](github_docs_styleguide.md)

!!! warning "Security boundary"
    This project is not a hardened public internet service by default.
    If you expose it publicly, add authentication, TLS/reverse proxy,
    rate limiting, and robust secret management first.

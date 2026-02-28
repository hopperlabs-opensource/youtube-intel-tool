<div class="yit-hero">
  <h1>YouTube Intel Tool</h1>
  <p>Turn long YouTube videos into a local, time-indexed research surface with transcript search, entities, grounded chat, and operational observability.</p>
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

    Then open `http://localhost:<YIT_WEB_PORT>` (default `3333`).

=== "Agentic"

    Use your preferred agentic CLI in repo root with:

    ```text
    Read docs/GETTING_STARTED.md and docs/RUNBOOKS.md.
    Bring up the stack locally, verify health, and ingest one URL.
    ```

## Documentation Paths

- Start fast: [Quick Start](QUICKSTART.md)
- New here: [Getting Started](GETTING_STARTED.md)
- Operating the stack: [Runbooks](RUNBOOKS.md)
- Integration: [CLI](CLI.md) and [API](API.md)
- Project policy: [Governance](GOVERNANCE.md)
- Community channels: [Connect & Support](CONNECT.md)

!!! warning "Security boundary"
    This project is not a hardened public internet service by default.
    If you expose it publicly, add authentication, TLS/reverse proxy,
    rate limiting, and robust secret management first.

# Governance
Owner: Maintainers
Status: Stable
Last updated: 2026-02-28

## TL;DR
- Public contributors use fork + pull request.
- `main` is protected; maintainers manage merges and release operations.
- Elevated access requires strong security posture (including 2FA).

How this repository is operated and how access is granted.

## Contribution model

- Public contributions are welcome through fork + pull request.
- `main` is protected and requires pull requests plus passing checks.
- Direct pushes to `main` are restricted to approved maintainers.

## Who can push

- By default, only repository maintainers can push branches in the upstream repo.
- Public users cannot push to upstream; they contribute through forks.

## Maintainer policy

Maintainer access is considered for contributors who consistently demonstrate:

- high-signal technical contributions
- reliable review and communication behavior
- secure development practices

Access is granted with least privilege first (`maintain` before `admin`).

## Security baseline

- Organization policy requires 2FA for members with elevated repository access.
- Maintainers are expected to keep 2FA enabled on GitHub.
- Sensitive paths are code-owner protected (`.github/workflows`, release/config files).
- Secret scanning and push protection should remain enabled.

## Contact

- Preferred: open a GitHub Discussion/Issue for governance or maintainer requests.
- Official channels are tracked in [CONNECT.md](CONNECT.md).
- Direct email should be published only after a dedicated role alias is set up.

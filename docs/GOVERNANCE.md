# Governance

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
- Optional email: `grass@hopperlabs.ai`.

Note: public emails attract spam. A dedicated role alias (for example `oss@...`)
is safer than a personal mailbox.

# Security Policy

## Security model and intended deployment

This repository is designed first for local/self-hosted use on trusted
infrastructure.

By default, this project is **not** a hardened public SaaS deployment. If you
expose it to the public internet without additional controls, you may allow:

- unauthenticated API access
- transcript/chat data disclosure
- header/token leakage
- queue/compute abuse

Before any internet-facing deployment, implement at minimum:

- strong authentication and authorization
- TLS termination and a reverse proxy
- request rate limits and abuse protections
- CORS and origin restrictions
- secret management and key rotation
- logging, alerting, and incident response playbooks

## Maintainer account security

Repository maintainers and organization members should use strong account
security controls, including two-factor authentication (2FA), before receiving
write/admin privileges.

## Supported versions

| Version | Supported |
| --- | --- |
| `0.x` | Yes |
| `<0.x` | No |

## Reporting a vulnerability

Please use GitHub Security Advisories for private reporting.

If that is not available, open an issue with minimal detail and explicitly ask
for a private channel to share reproduction details.

When reporting, include:
- affected component(s)
- reproduction steps
- impact assessment
- any proof-of-concept material

## Response targets
- Initial acknowledgement: within 3 business days
- Triage and severity assessment: within 7 business days
- Fix plan or mitigation guidance: as soon as practical based on severity

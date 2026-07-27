# Security policy

## Current support status

Bestdecks has not published a production release. Security fixes must land through reviewed changes before release readiness can pass.

Do not interpret repository availability, a passing unit test, or an implemented provider adapter as a security certification. No SOC 2, penetration-test, or service-level claim is made.

## Report a vulnerability privately

Use the repository's private **Report a vulnerability** / GitHub Security Advisory flow. Do not open a public issue for suspected vulnerabilities, exposed credentials, tenant-isolation problems, or exploit details.

If private reporting is not enabled, contact the repository owner through the verified contact method on their GitHub profile and ask for a private disclosure channel. Do not place sensitive details in that first public-facing message.

Include, when practical:

- affected commit or version;
- affected route, module, or deployment surface;
- minimal reproduction steps;
- expected and observed behavior;
- impact and required preconditions;
- whether any real credential, personal data, or third-party account may be affected.

Do not include live secrets. Redact tokens, passwords, cookies, provider responses, customer content, and personal data.

## Maintainer response

Maintainers should:

1. acknowledge the report through the private channel;
2. preserve evidence without publishing secrets;
3. determine whether credential rotation or provider notification is required;
4. patch the narrowest affected boundary and add a regression test;
5. scan adjacent instances and Git history where exposure is plausible;
6. document affected versions and safe remediation before public disclosure.

No response-time commitment is published yet.

## Deployment responsibilities

Self-hosters are responsible for:

- generating independent high-entropy authentication and application-encryption secrets;
- keeping `.env`, `.env.local`, provider keys, database files, and backups out of source control;
- scoping provider credentials to the minimum permissions required;
- terminating TLS at a reviewed reverse proxy;
- restricting admin bootstrap and disabling it after use;
- protecting the local database and backup locations;
- reviewing outbound crawl policy, provider terms, retention, and data residency;
- rotating credentials after suspected exposure;
- applying dependency and base-image updates after review.

See [self-hosting](./docs/self-hosting.md) for the deployment checklist.

## Optional Strix assessment

This repository includes a manual [Strix security assessment workflow](./.github/workflows/strix.yml).
It is intentionally not triggered on every pull request: Strix runs a source-aware AI assessment,
requires Docker and an LLM credential, and can incur provider cost. A maintainer must set the
`STRIX_LLM` and `LLM_API_KEY` repository secrets, then dispatch the workflow with an explicit spend
cap. Review the provider's data-handling terms before allowing source code to be assessed.

Run the same check locally only against a repository you own or are authorized to test:

```bash
export STRIX_LLM='openai/<approved-model>'
export LLM_API_KEY='<scoped-api-key>'
strix -n --target . --mount . -m standard --scope-mode full --max-budget-usd 20
```

`--mount .` is recommended for a local checkout because it avoids copying `node_modules` into the
Strix sandbox. Strix findings require normal reproduction, impact review, and a regression test
before they are treated as confirmed vulnerabilities.

## Known release blockers

The current release gate includes:

- a complete repository and history secret scan;
- tenant-isolation and internal-route authorization tests;
- billing and webhook replay tests for any hosted service;
- encryption, rotation, and log-redaction tests;
- deterministic evidence coverage before automated delivery;
- backup/restore and data-export verification;
- a controlled live reference run with a redacted receipt.

The authoritative checklist is [docs/release-readiness.md](./docs/release-readiness.md).

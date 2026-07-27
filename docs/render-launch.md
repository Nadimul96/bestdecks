# Hosted deployment status

The previous Render launch guide was archived on 2026-07-13 because it contained live identity
details, personal sign-in credential material, provider-specific account data, and instructions for an
execution path that is not restart-safe.

Do not deploy or promote the hosted service from this document. Hosted deployment remains blocked
until the v0.1 release gate in `docs/release-readiness.md` passes and an operator explicitly approves
the target environment and deployment operation.

The retired instructions also configured Presenton as a model-backed generator. That is not the
current contract: Bestdecks now owns the exact native-vector slide UI and uses a Basic-authenticated,
network-isolated Presenton service only to export PPTX.

For the supported self-hosted path, follow `README.md` and `docs/self-hosting.md`.

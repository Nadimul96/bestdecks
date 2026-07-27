ARG CADDY_IMAGE
FROM ${CADDY_IMAGE}
ARG CADDY_IMAGE

# Compose interpolation only proves the value is non-empty. Enforce the actual
# immutable-image contract inside the build as well.
RUN printf '%s' "${CADDY_IMAGE}" | grep -Eq '@sha256:[0-9a-f]{64}$'

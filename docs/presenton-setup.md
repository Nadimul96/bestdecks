# Presenton setup

Bestdecks uses Presenton as a deterministic, self-hosted PPTX renderer. Gemini plans the deck;
Bestdecks then constructs the complete native-vector slide UI locally. Presenton does not research,
write, rewrite, style, or choose layouts on the v0.1 path.

## Render-only boundary

- Bestdecks calls only the pinned OSS create, exact-update, and export routes.
- Every slide is a complete caller-owned `SlideModel.ui`; no Presenton content/layout generation
  route is used.
- The service receives HTTP Basic credentials only. The adapter rejects `api.presenton.ai`, bearer
  API keys, absent Basic credentials, and mixed authentication modes.
- Presenton receives no OpenAI key, model identifier, image-provider key, or other model credential.
- Generated and remote media are disabled. Visual richness comes from deterministic native-vector
  backgrounds, panels, accents, typography, and layout variation.
- The local helper creates a dedicated internal Docker network. In production, Presenton joins only
  the internal backend network and has no provider-egress network.

The pinned upstream image requires an `LLM` selector to start. The helper supplies `LLM=openai` only
as an upstream compatibility value, with `CAN_CHANGE_KEYS=true`; it supplies no model credential,
and the request and network boundaries above prevent model dispatch. Do not interpret that selector
as an OpenAI integration.

## Recommended V1 mode

Run Presenton as a local or private internal service and call its REST API from this app.

Default base URL:

- `http://localhost:5050`

## Quick start

```bash
pnpm presenton:start
```

The helper reads the required values from `.env.local` with a dotenv parser (or from shell exports,
which take precedence), requires a digest-pinned `PRESENTON_IMAGE`, pre-seeds Basic auth, binds the
renderer to loopback, creates a dedicated internal network, and fixes `DISABLE_IMAGE_GENERATION=true`.
It never shell-sources `.env.local`, so configuration cannot execute shell code. Keep image generation
disabled for the v0.1 attested profile. A qualifying v0.1 run must use the exact image recorded in
the canonical manifest, not merely any digest-shaped Presenton reference. Inspect the script before
first use.

Open:

- `http://localhost:5050`

## Environment variables for this project

```bash
PRESENTON_IMAGE=ghcr.io/presenton/presenton@sha256:8757c5d0b842e4572aeaa6bbc79817ee201a05c73909fb46bb2972165eac0a88
PRESENTON_BASE_URL=http://localhost:5050
PRESENTON_AUTH_USERNAME=admin
PRESENTON_AUTH_PASSWORD=<independent-renderer-password>
PRESENTON_TEMPLATE=bestdecks_inline_vector_v1
```

[`deploy/presenton/rich-static-v1.manifest.json`](../deploy/presenton/rich-static-v1.manifest.json)
is the canonical v0.1 renderer identity. It binds:

- profile `rich_static_v1` and verification method `pptx_ooxml_rich_static_v2`;
- Presenton source commit `882a826f274ddbd4650cdb21b3a9ff4d16276fe9`;
- the OCI image digest shown above;
- template `bestdecks_inline_vector_v1` and its content-free UI schema SHA-256
  `3e229b0b08e9e89b834d0fa54fa54a8df76200795b0a7acd15ce98bb47a12d2f`;
- theme `bestdecks_green_v1` and layouts `bestdecks_split_panel_v1`,
  `bestdecks_card_grid_v1`, `bestdecks_index_grid_v1`, and `bestdecks_spotlight_v1`;
- the closed palette, Arial font allowlist, and no-media policy;
- closed visual-attestation profile SHA-256
  `b823d08063d0b57924b27a953d2fb4cf6585edf5297cd4b5560cf335db864cd4`.

The app rejects any configured template identifier other than the manifest profile's exact value.
That setting is a Bestdecks profile assertion only; it is never sent to Presenton. The local helper
verifies that `PRESENTON_IMAGE` is digest-shaped and will not reuse a mismatched existing container
or network; the manifest supplies the exact qualifying digest. Preserve both boundaries when
reproducing a run.

## Port note for macOS

On macOS, port `5000` is often already occupied by Control Center / AirTunes.
Use `5050` unless you know `5000` is free.

Current Presenton requires HTTP Basic authentication on `/api/v1/` routes. Use the same
`PRESENTON_AUTH_USERNAME` and `PRESENTON_AUTH_PASSWORD` values to preseed Presenton and configure
Bestdecks. The v0.1 adapter is self-hosted-only and rejects bearer/API-key configuration.

## API shape used in this project

Bestdecks performs three mutations in order:

1. `POST /api/v1/ppt/presentation/create` creates a blank V2 presentation shell.
2. `PATCH /api/v1/ppt/presentation/update` replaces it with the exact caller-built slides.
3. `POST /api/v1/ppt/presentation/edit` exports that unchanged presentation as PPTX.

The create body contains only:

- `content=""`
- the exact positive `n_slides`
- `language="English"`
- `include_table_of_contents=false`
- `include_title_slide=false`
- `web_search=false`

The update body contains the presentation ID, title, slide count, and complete `slides` array. Each
slide carries caller-generated UUIDs, the exact deterministic Bestdecks layout identifiers, empty
model-content fields, and a complete `ui` component tree. The adapter compares Presenton's entire
update echo with the canonical request before export.

The export body is exactly:

```json
{
  "presentation_id": "<create-response-uuid>",
  "slides": [],
  "export_as": "pptx"
}
```

The adapter rejects non-empty requested image URLs and any questionnaire other than
`imagePolicy=never`, `visualDensity=rich`, and `visualContentTypes=[]`. It validates the exact create
echo, exact update echo, export presentation ID, same-origin path, `.pptx` suffix, response size,
content type, ZIP signature, artifact hash, visible text, and visual profile. Only explicit HTTP
429 responses are eligible for bounded mutation retry; ambiguous mutation outcomes are not replayed.

Adapter result fields are limited to:

- `presentationId`
- normalized, same-origin `.pptx` export URL

Presenton may return `edit_path`, but Bestdecks discards it before the durable checkpoint. Editor
links, raw provider paths, model identifiers, usage, and credits are outside the strict PPTX-only
release profile.

## Project mapping

- The v0.1 reference worker admits only `pptx`.
- The mandatory visual profile is rich-static: generated and remote media are disabled, while
  every accepted slide requires a deterministic native-vector composition, explicitly styled text,
  and sufficient layout variation across a multi-slide deck.
- Delivery requires one canonical ZIP view, the exact allowed
  presentation/master/layout/theme relationship graph, exact approved DrawingML text on a 16:9
  canvas, non-overlapping in-bounds text boxes, manifest-bound native-vector geometry, the manifest
  palette and font, and at least 4.5:1 text/background contrast. Pictures,
  media, charts, OLE objects, animation, custom geometry, external relationships, and unknown
  package parts fail closed.
- The verifier returns the closed visual-profile attestation, including measured slide, vector,
  styling, layout-signature, and palette counts. Delivery is unavailable unless the durable
  readiness record sets `visualProfileVerified=true`.
- This verifier is an artifact allowlist, not a general-purpose PPTX or ISO/IEC 29500 validator.
  Deterministic fixtures prove local request and verifier behavior only; they do not prove that the
  exact pinned Presenton image and inline UI profile emit a conforming PPTX. A controlled live
  export must pass the same verifier and be retained before release. Do not weaken attestation
  merely to accept different renderer output.
- PDF and editor-link adapters are not part of the release path. Supporting
  either requires a separate semantic artifact-verification contract.

## Sources

- https://github.com/presenton/presenton
- https://docs.presenton.ai/using-presenton-api

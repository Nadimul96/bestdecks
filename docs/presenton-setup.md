# Presenton Setup

Presenton is a viable self-hosted replacement for Gamma for this project.

## Important reality check

Presenton is open source and self-hostable, but it is not automatically cost-free.

- The software itself is Apache 2.0 licensed.
- If you use OpenAI, Gemini, Anthropic, or another hosted model inside Presenton, you still pay those provider costs.
- It can become much closer to free if you run local models with Ollama and avoid paid image providers.

## Recommended V1 mode

Run Presenton as a local or private internal service and call its REST API from this app.

Default base URL:

- `http://localhost:5050`

## Quick start from the Presenton README

```bash
docker run -it --name presenton -p 5050:80 -v "./app_data:/app_data" ghcr.io/presenton/presenton:latest
```

Open:

- `http://localhost:5050`

## Environment variables for this project

```bash
PRESENTON_BASE_URL=http://localhost:5050
PRESENTON_API_KEY=
PRESENTON_TEMPLATE=general
```

## Port note for macOS

On macOS, port `5000` is often already occupied by Control Center / AirTunes.
Use `5050` unless you know `5000` is free.

`PRESENTON_API_KEY` is optional in this app because the self-hosted API examples in the Presenton README do not show authentication by default.

## API shape used in this project

Endpoint:

- `POST /api/v1/ppt/presentation/generate`

Body fields used:

- `content`
- `instructions`
- `tone`
- `verbosity`
- `web_search`
- `n_slides`
- `language`
- `template`
- `include_table_of_contents`
- `include_title_slide`
- `export_as`

Response fields used:

- `presentation_id`
- `path`
- `edit_path`

## Project mapping

- `presenton_editor` output format returns the `edit_path` as the primary delivery URL.
- `pdf` returns the generated PDF file URL.
- `pptx` returns the generated PowerPoint file URL.

## Sources

- https://github.com/presenton/presenton
- https://docs.presenton.ai/using-presenton-api

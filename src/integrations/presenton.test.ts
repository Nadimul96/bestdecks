import test from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingHttpHeaders,
  type RequestListener,
  type Server,
} from "node:http";

import { MAX_DELIVERY_ARTIFACT_BYTES } from "@/src/domain/artifact-limits";
import {
  RICH_STATIC_VISUAL_PROFILE,
  selectRichStaticLayoutIds,
} from "@/src/domain/visual-profile";
import {
  buildPresentonSlidesMarkdown,
  PresentonDeckProvider,
  PresentonProviderError,
} from "./presenton";
import { createPptxFixture } from "./pptx-fixture.test-helper";
import type { DeckGenerationInput } from "./providers";

const baseInput: DeckGenerationInput = {
  companyBrief: {
    websiteUrl: "https://example.com",
    companyName: "Example Co",
    industry: "Software",
    offer: "B2B workflow software",
    painPoints: ["Manual reporting", "Slow follow-up"],
    proofPoints: ["Clear ICP"],
    pitchAngles: ["Faster sales motion"],
    sourceUrls: ["https://example.com"],
  },
  sellerPositioningSummary: "We build tailored outreach decks.",
  archetype: "cold_outreach",
  objective: "Win an intro call",
  audience: "Founder",
  cardCount: 5,
  callToAction: "Book a call",
  tone: "consultative",
  visualStyle: "sales_polished",
  mustInclude: ["Specific observations"],
  mustAvoid: ["Buzzwords"],
  outputFormat: "pptx",
  imagePolicy: "never",
  visualContentTypes: [],
  visualDensity: "rich",
};

const baseSlides = [
  { headline: "A relevant opening", bulletPoints: [] },
  { headline: "The observable shift", bulletPoints: ["Manual reporting slows follow-up"] },
  { headline: "A focused solution", bulletPoints: ["Automate the repeated work"] },
  { headline: "Evidence", bulletPoints: ["Clear ICP"] },
  { headline: "Book a call", bulletPoints: [] },
];

const fixtureBasicUsername = "fixture-user";
const fixtureBasicPassword = "fixture-value";
const fixtureHostedKey = "fixture-value";
const PRESENTATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PRESENTATION_ID = "22222222-2222-4222-8222-222222222222";

function providerFor(baseUrl: string) {
  return new PresentonDeckProvider({
    baseUrl,
    basicAuthUsername: fixtureBasicUsername,
    basicAuthPassword: fixtureBasicPassword,
    allowPrivateNetwork: true,
  });
}

function createOptions(slides = baseSlides) {
  return {
    exactSlides: slides,
    layoutIds: selectRichStaticLayoutIds(slides.length),
  };
}

function artifactOptions(
  expectedSlides: Array<{ headline: string; bulletPoints: string[] }>,
) {
  return {
    expectedSlides,
    layoutIds: selectRichStaticLayoutIds(expectedSlides.length),
  };
}

interface CapturedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

interface FixtureResponse {
  status?: number;
  body: unknown;
}

type FixtureResponder = (request: CapturedRequest) => FixtureResponse;

function successfulMutationResponse(request: CapturedRequest): FixtureResponse {
  if (request.url === "/api/v1/ppt/presentation/create") {
    return {
      body: {
        id: PRESENTATION_ID,
        version: "v2-standard",
        ...request.body,
      },
    };
  }
  if (request.url === "/api/v1/ppt/presentation/update") {
    return {
      body: {
        id: request.body.id,
        n_slides: request.body.n_slides,
        title: request.body.title,
        slides: request.body.slides,
      },
    };
  }
  if (request.url === "/api/v1/ppt/presentation/edit") {
    return {
      body: {
        presentation_id: request.body.presentation_id,
        path: "/exports/presentation.pptx",
        edit_path: `/presentation?id=${String(request.body.presentation_id)}`,
      },
    };
  }
  return { status: 404, body: { detail: "not found" } };
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose an IP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function withServer<T>(handler: RequestListener, operation: (baseUrl: string) => Promise<T>) {
  const server = createServer(handler);
  const baseUrl = await listen(server);
  try {
    return await operation(baseUrl);
  } finally {
    await close(server);
  }
}

async function withPresentonServer<T>(
  responder: FixtureResponder,
  operation: (fixture: { baseUrl: string; requests: CapturedRequest[] }) => Promise<T>,
) {
  const requests: CapturedRequest[] = [];
  return withServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const captured = {
        method: request.method ?? "",
        url: request.url ?? "",
        headers: request.headers,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
      } satisfies CapturedRequest;
      requests.push(captured);
      const fixtureResponse = responder(captured);
      response.writeHead(fixtureResponse.status ?? 200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(fixtureResponse.body));
    });
  }, (baseUrl) => operation({ baseUrl, requests }));
}

test("PresentonDeckProvider uses the exact create, update, export render-only contract", async () => {
  await withPresentonServer(successfulMutationResponse, async ({ baseUrl, requests }) => {
    const observations: unknown[] = [];
    const provider = new PresentonDeckProvider({
      baseUrl,
      basicAuthUsername: fixtureBasicUsername,
      basicAuthPassword: fixtureBasicPassword,
      defaultTemplate: RICH_STATIC_VISUAL_PROFILE.templateId,
      allowPrivateNetwork: true,
    });
    const result = await provider.createDeck(baseInput, [], {
      ...createOptions(),
      idempotencyKey: "unproven-idempotency-key",
      onObservability: (value) => observations.push(value),
    });

    assert.deepEqual(
      requests.map(({ method, url }) => ({ method, url })),
      [
        { method: "POST", url: "/api/v1/ppt/presentation/create" },
        { method: "PATCH", url: "/api/v1/ppt/presentation/update" },
        { method: "POST", url: "/api/v1/ppt/presentation/edit" },
      ],
    );
    const expectedAuthorization = `Basic ${Buffer.from(`${fixtureBasicUsername}:${fixtureBasicPassword}`).toString("base64")}`;
    for (const request of requests) {
      assert.equal(request.headers.authorization, expectedAuthorization);
      assert.equal(request.headers["idempotency-key"], undefined);
    }

    assert.deepEqual(requests[0]!.body, {
      content: "",
      n_slides: baseSlides.length,
      language: "English",
      include_table_of_contents: false,
      include_title_slide: false,
      web_search: false,
    });

    const updateBody = requests[1]!.body;
    assert.deepEqual(Object.keys(updateBody).sort(), ["id", "n_slides", "slides", "title"]);
    assert.equal(updateBody.id, PRESENTATION_ID);
    assert.equal(updateBody.n_slides, baseSlides.length);
    assert.equal(updateBody.title, "Bestdecks");
    assert.ok(Array.isArray(updateBody.slides));
    const sentSlides = updateBody.slides as Array<Record<string, unknown>>;
    assert.equal(sentSlides.length, baseSlides.length);
    assert.deepEqual(sentSlides.map((slide) => slide.layout), selectRichStaticLayoutIds(5));
    assert.deepEqual(sentSlides.map((slide) => slide.index), [0, 1, 2, 3, 4]);
    assert.ok(sentSlides.every((slide) => slide.presentation === PRESENTATION_ID));
    assert.ok(sentSlides.every((slide) => typeof slide.ui === "object" && slide.ui !== null));
    const slideIds = sentSlides.map((slide) => String(slide.id));
    assert.equal(new Set(slideIds).size, baseSlides.length);
    assert.ok(slideIds.every((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)
    ));

    assert.deepEqual(requests[2]!.body, {
      presentation_id: PRESENTATION_ID,
      slides: [],
      export_as: "pptx",
    });
    const allRequestJson = JSON.stringify(requests.map((request) => request.body));
    for (const forbiddenKey of [
      "slides_markdown",
      "slides_layout",
      "instructions",
      "tone",
      "verbosity",
      "content_generation",
      "markdown_emphasis",
      "template",
      "model",
      "model_id",
      "provider",
      "file_paths",
      "files",
      "image_url",
    ]) {
      assert.doesNotMatch(allRequestJson, new RegExp(`"${forbiddenKey}"`, "u"));
    }

    assert.equal(result.presentationId, PRESENTATION_ID);
    assert.equal(result.exportUrl, `${baseUrl}/exports/presentation.pptx`);
    assert.equal(result.editorUrl, undefined);
    assert.equal(result.usage, undefined);
    assert.deepEqual(observations, []);
  });
});

test("PresentonDeckProvider rejects unsupported inputs before creating a presentation", async () => {
  await withPresentonServer(successfulMutationResponse, async ({ baseUrl, requests }) => {
    const provider = providerFor(baseUrl);

    for (const outputFormat of ["pdf", "bestdecks_editor"] as const) {
      await assert.rejects(
        () => provider.createDeck({ ...baseInput, outputFormat }, [], createOptions()),
        (error: unknown) =>
          error instanceof PresentonProviderError
          && error.code === "client_request"
          && error.retryable === false,
      );
    }
    await assert.rejects(
      () => provider.createDeck({ ...baseInput, cardCount: 1 }, [], {
        exactSlides: [{
          headline: "Approved claim",
          bulletPoints: ["![remote][private]", "[private]: http://127.0.0.1/private.png"],
        }],
        layoutIds: selectRichStaticLayoutIds(1),
      }),
      (error: unknown) => error instanceof PresentonProviderError && error.code === "contract",
    );
    await assert.rejects(
      () => provider.createDeck(baseInput, ["https://example.test/image.png"], createOptions()),
      (error: unknown) => error instanceof PresentonProviderError && error.code === "contract",
    );
    await assert.rejects(
      () => provider.createDeck({ ...baseInput, visualDensity: "minimal" }, [], createOptions()),
      (error: unknown) => error instanceof PresentonProviderError && error.code === "contract",
    );
    await assert.rejects(
      () => provider.createDeck(baseInput, [], {
        slidesMarkdown: buildPresentonSlidesMarkdown(baseSlides),
        layoutIds: selectRichStaticLayoutIds(baseInput.cardCount),
      }),
      (error: unknown) => error instanceof PresentonProviderError && error.code === "contract",
    );
    await assert.rejects(
      () => provider.createDeck(baseInput, [], {
        exactSlides: baseSlides,
        layoutIds: selectRichStaticLayoutIds(baseInput.cardCount).reverse(),
      }),
      (error: unknown) => error instanceof PresentonProviderError && error.code === "contract",
    );
    assert.equal(requests.length, 0);
  });
});

test("PresentonDeckProvider requires self-hosted Basic auth and rejects API-key auth", () => {
  const invalidOptions = [
    { baseUrl: "https://api.presenton.ai", basicAuthUsername: fixtureBasicUsername, basicAuthPassword: fixtureBasicPassword },
    { baseUrl: "https://api.presenton.ai.", basicAuthUsername: fixtureBasicUsername, basicAuthPassword: fixtureBasicPassword },
    { baseUrl: "https://www.presenton.ai", basicAuthUsername: fixtureBasicUsername, basicAuthPassword: fixtureBasicPassword },
    { baseUrl: "https://api.presenton.ai", apiKey: fixtureHostedKey },
    { baseUrl: "https://presenton.example.test", apiKey: fixtureHostedKey },
    { baseUrl: "https://presenton.example.test", apiKey: fixtureHostedKey, basicAuthUsername: fixtureBasicUsername, basicAuthPassword: fixtureBasicPassword },
    { baseUrl: "https://presenton.example.test", basicAuthUsername: fixtureBasicUsername },
    { baseUrl: "https://presenton.example.test", basicAuthPassword: fixtureBasicPassword },
    { baseUrl: "https://presenton.example.test", basicAuthUsername: " fixture-user", basicAuthPassword: fixtureBasicPassword },
    { baseUrl: "https://presenton.example.test", basicAuthUsername: "fixture:user", basicAuthPassword: fixtureBasicPassword },
    { baseUrl: "https://presenton.example.test", basicAuthUsername: fixtureBasicUsername, basicAuthPassword: "short" },
  ];
  for (const options of invalidOptions) {
    assert.throws(
      () => new PresentonDeckProvider(options),
      (error: unknown) =>
        error instanceof PresentonProviderError
        && error.code === "configuration"
        && error.retryable === false,
    );
  }
});

test("PresentonDeckProvider rejects partial or mismatched mutation responses", async () => {
  const cases: Array<{
    label: string;
    expectedRequests: number;
    responder: FixtureResponder;
  }> = [
    {
      label: "partial create response",
      expectedRequests: 1,
      responder: () => ({ body: { id: PRESENTATION_ID, version: "v2-standard" } }),
    },
    {
      label: "create slide-count mismatch",
      expectedRequests: 1,
      responder: (request) => request.url.endsWith("/create")
        ? { body: { id: PRESENTATION_ID, version: "v2-standard", ...request.body, n_slides: 4 } }
        : successfulMutationResponse(request),
    },
    {
      label: "partial update response",
      expectedRequests: 2,
      responder: (request) => request.url.endsWith("/update")
        ? { body: { id: PRESENTATION_ID, n_slides: 5, title: "Bestdecks", slides: [] } }
        : successfulMutationResponse(request),
    },
    {
      label: "update layout mismatch",
      expectedRequests: 2,
      responder: (request) => {
        if (!request.url.endsWith("/update")) return successfulMutationResponse(request);
        const slides = structuredClone(request.body.slides) as Array<Record<string, unknown>>;
        slides[0]!.layout = "unexpected_layout";
        return { body: { id: PRESENTATION_ID, n_slides: 5, title: "Bestdecks", slides } };
      },
    },
    {
      label: "update UI mismatch",
      expectedRequests: 2,
      responder: (request) => {
        if (!request.url.endsWith("/update")) return successfulMutationResponse(request);
        const slides = structuredClone(request.body.slides) as Array<{
          ui: { description: string };
        }>;
        slides[0]!.ui.description = "Mismatched but schema-valid layout description";
        return { body: { id: PRESENTATION_ID, n_slides: 5, title: "Bestdecks", slides } };
      },
    },
    {
      label: "export presentation mismatch",
      expectedRequests: 3,
      responder: (request) => request.url.endsWith("/edit")
        ? { body: { presentation_id: OTHER_PRESENTATION_ID, path: "/exports/presentation.pptx", edit_path: "/presentation" } }
        : successfulMutationResponse(request),
    },
    {
      label: "off-origin export",
      expectedRequests: 3,
      responder: (request) => request.url.endsWith("/edit")
        ? { body: { presentation_id: PRESENTATION_ID, path: "https://attacker.example/presentation.pptx", edit_path: "/presentation" } }
        : successfulMutationResponse(request),
    },
    {
      label: "signed export capability",
      expectedRequests: 3,
      responder: (request) => request.url.endsWith("/edit")
        ? { body: { presentation_id: PRESENTATION_ID, path: "/exports/presentation.pptx?X-Amz-Signature=secret", edit_path: "/presentation" } }
        : successfulMutationResponse(request),
    },
  ];

  for (const fixture of cases) {
    await withPresentonServer(fixture.responder, async ({ baseUrl, requests }) => {
      await assert.rejects(
        () => providerFor(baseUrl).createDeck(baseInput, [], createOptions()),
        (error: unknown) =>
          error instanceof PresentonProviderError
          && error.code === "contract"
          && error.retryable === false,
        fixture.label,
      );
      assert.equal(requests.length, fixture.expectedRequests, fixture.label);
    });
  }
});

test("PresentonDeckProvider never retries an ambiguous failed mutation", async () => {
  const paths = [
    "/api/v1/ppt/presentation/create",
    "/api/v1/ppt/presentation/update",
    "/api/v1/ppt/presentation/edit",
  ];
  for (const [index, failedPath] of paths.entries()) {
    await withPresentonServer(
      (request) => request.url === failedPath
        ? { status: 503, body: { detail: "provider unavailable" } }
        : successfulMutationResponse(request),
      async ({ baseUrl, requests }) => {
        await assert.rejects(
          () => providerFor(baseUrl).createDeck(baseInput, [], createOptions()),
          (error: unknown) =>
            error instanceof PresentonProviderError
            && error.code === "indeterminate_render_outcome"
            && error.retryable === false
            && error.status === 503,
        );
        assert.equal(requests.length, index + 1);
        assert.equal(requests.filter((request) => request.url === failedPath).length, 1);
      },
    );
  }
});

test("buildPresentonSlidesMarkdown maps only validated visible claims", () => {
  assert.deepEqual(buildPresentonSlidesMarkdown([
    { headline: "Exact headline", bulletPoints: ["First exact claim", "Second exact claim"] },
    { headline: "Exact CTA", bulletPoints: [] },
  ]), [
    "# Exact headline\n- First exact claim\n- Second exact claim",
    "# Exact CTA",
  ]);
  for (const bullet of [
    "![remote](http://127.0.0.1/image.png)",
    "[open](http://127.0.0.1/private)",
    "<iframe src='https://example.test'></iframe>",
    "![remote asset][private]",
  ]) {
    assert.throws(() => buildPresentonSlidesMarkdown([
      { headline: "Unsafe", bulletPoints: [bullet] },
    ]));
  }
});

test("PresentonDeckProvider authenticates and verifies a same-origin rich PPTX", async () => {
  const expectedSlides = [{ headline: "Approved headline", bulletPoints: ["Approved bullet"] }];
  const artifact = createPptxFixture([["Approved headline", "Approved bullet"]]);
  const authorizations: Array<string | undefined> = [];

  await withServer((request, response) => {
    authorizations.push(request.headers.authorization);
    response.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    response.end(artifact);
  }, async (baseUrl) => {
    const verification = await providerFor(baseUrl).verifyArtifact({
      presentationId: PRESENTATION_ID,
      exportUrl: `${baseUrl}/artifact.pptx`,
    }, artifactOptions(expectedSlides));
    assert.equal(verification.byteLength, artifact.byteLength);
    assert.equal(verification.contentVerification.slideCount, 1);
    assert.equal(verification.visualProfile.measuredRichness.slideCount, 1);
  });

  assert.deepEqual(authorizations, [
    `Basic ${Buffer.from(`${fixtureBasicUsername}:${fixtureBasicPassword}`).toString("base64")}`,
  ]);
});

test("PresentonDeckProvider rejects off-origin and non-PPTX artifact URLs before fetching", async () => {
  let baseRequests = 0;
  let offOriginRequests = 0;
  const baseServer = createServer((_request, response) => {
    baseRequests += 1;
    response.writeHead(200);
    response.end();
  });
  const offOriginServer = createServer((_request, response) => {
    offOriginRequests += 1;
    response.writeHead(200);
    response.end();
  });
  const baseUrl = await listen(baseServer);
  const offOriginUrl = await listen(offOriginServer);
  try {
    const provider = providerFor(baseUrl);
    for (const exportUrl of [
      `${offOriginUrl}/artifact.pptx`,
      `${baseUrl}/artifact`,
    ]) {
      await assert.rejects(
        () => provider.verifyArtifact({ presentationId: PRESENTATION_ID, exportUrl },
          artifactOptions([{ headline: "Approved", bulletPoints: [] }])),
        (error: unknown) => error instanceof PresentonProviderError && error.code === "contract",
      );
    }
    assert.equal(baseRequests, 0);
    assert.equal(offOriginRequests, 0);
  } finally {
    await close(baseServer);
    await close(offOriginServer);
  }
});

test("PresentonDeckProvider enforces artifact size, format, and exact text", async () => {
  const cases: Array<{
    label: string;
    headers: Record<string, string>;
    body?: string | Buffer;
    expectedSlides: Array<{ headline: string; bulletPoints: string[] }>;
  }> = [
    {
      label: "oversized",
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Length": String(MAX_DELIVERY_ARTIFACT_BYTES + 1),
      },
      expectedSlides: [{ headline: "Approved", bulletPoints: [] }],
    },
    {
      label: "wrong content type",
      headers: { "Content-Type": "text/html" },
      body: "<html>not a deck</html>",
      expectedSlides: [{ headline: "Approved", bulletPoints: [] }],
    },
    {
      label: "renderer-added text",
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
      body: createPptxFixture([["Approved claim", "Invented 42% result"]]),
      expectedSlides: [{ headline: "Approved claim", bulletPoints: [] }],
    },
  ];

  for (const fixture of cases) {
    await withServer((_request, response) => {
      response.writeHead(200, fixture.headers);
      response.end(fixture.body);
    }, async (baseUrl) => {
      await assert.rejects(
        () => providerFor(baseUrl).verifyArtifact({
          presentationId: PRESENTATION_ID,
          exportUrl: `${baseUrl}/artifact.pptx`,
        }, artifactOptions(fixture.expectedSlides)),
        (error: unknown) =>
          error instanceof PresentonProviderError
          && error.code === "contract"
          && error.retryable === false,
        fixture.label,
      );
    });
  }
});

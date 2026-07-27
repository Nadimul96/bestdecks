import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { evaluateEvidence } from "@/src/domain/evidence";
import {
  RICH_STATIC_VISUAL_PROFILE,
  RICH_STATIC_VISUAL_PROFILE_SHA256,
  selectRichStaticLayoutIds,
} from "@/src/domain/visual-profile";
import { hashExpectedSlideText } from "@/src/integrations/pptx-content-verifier";
import {
  createDeliveryDownloadHandler,
  MAX_DELIVERY_ARTIFACT_BYTES,
  type DeliveryDownloadDependencies,
} from "./delivery-download";

const ownerId = "owner-fixture";
const fixtureUsername = "fixture-user";
const fixturePassword = "fixture-value";
const fixtureBearer = "fixture-value";
const pptxBody = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from("fixture-pptx-body"),
]);
const pdfBody = Buffer.from("%PDF-fixture-body");

function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

function richStaticVisualProfileFixture(slideCount: number) {
  const layoutIds = selectRichStaticLayoutIds(slideCount);
  return {
    id: RICH_STATIC_VISUAL_PROFILE.profileId,
    manifestSha256: RICH_STATIC_VISUAL_PROFILE_SHA256,
    templateId: RICH_STATIC_VISUAL_PROFILE.templateId,
    templateSha256: RICH_STATIC_VISUAL_PROFILE.templateSha256,
    themeId: RICH_STATIC_VISUAL_PROFILE.themeId,
    layoutIds,
    measuredRichness: {
      slideCount,
      vectorShapeCount: slideCount * 2,
      styledTextRunCount: slideCount,
      slidesWithBackground: slideCount,
      slidesWithVectorAccents: slideCount,
      distinctLayoutSignatures: new Set(layoutIds).size,
      distinctPaletteColors: 3,
    },
  };
}

function deliveredArtifact(url: string, body: Buffer, contentType?: string) {
  const timestamp = "2026-07-13T12:00:00.000Z";
  const expectedSlides = readyPlanningCheckpoint().plan.slides.map(
    ({ headline, bulletPoints }) => ({ headline, bulletPoints }),
  );
  return {
    outcome: "delivered",
    result: {
      presentationId: "presentation-fixture",
      exportUrl: url,
    },
    verification: {
      url,
      sha256: sha256(body),
      byteLength: body.byteLength,
      ...(contentType ? { contentType } : {}),
      verifiedAt: timestamp,
      contentVerification: {
        method: "pptx_ooxml_rich_static_v2" as const,
        sha256: hashExpectedSlideText(expectedSlides),
        slideCount: expectedSlides.length,
      },
      visualProfile: richStaticVisualProfileFixture(expectedSlides.length),
    },
    readiness: {
      requiredSlideFieldsPresent: true,
      ctaPresent: true,
      evidenceGatePassed: true,
      artifactReadable: true,
      providerProvenancePresent: true,
      visualProfileVerified: true,
    },
    timing: {
      startedAt: timestamp,
      completedAt: timestamp,
      durationMs: 0,
    },
  };
}

function readyPlanningCheckpoint() {
  const evidence = {
    sources: [],
    claims: [{
      id: "claim:slide-01-headline",
      text: "Review the proposal",
      claimClass: "seller_claim" as const,
      supportStatus: "seller_supplied" as const,
      citedSourceIds: [],
    }],
  };
  const timestamp = "2026-07-13T12:00:00.000Z";
  return {
    outcome: "ready" as const,
    plan: {
      title: "Example proposal",
      slides: [{
        slideNumber: 1,
        purpose: "cta",
        headline: "Review the proposal",
        headlineClaimId: "claim:slide-01-headline",
        bulletPoints: [],
        bulletClaimIds: [],
        speakerNotes: "",
        suggestImage: false,
      }],
      evidence,
    },
    evidenceEvaluation: evaluateEvidence(evidence),
    readiness: {
      requiredSlideFieldsPresent: true,
      ctaPresent: true,
      evidenceGatePassed: true,
      artifactReadable: false,
      providerProvenancePresent: true,
      visualProfileVerified: false,
    },
    timing: {
      startedAt: timestamp,
      completedAt: timestamp,
      durationMs: 0,
    },
  };
}

function dependencies(
  artifact: unknown,
  overrides: Partial<DeliveryDownloadDependencies> = {},
): DeliveryDownloadDependencies {
  return {
    getSession: async () => ({ user: { id: ownerId } }),
    getOwnedDeliveryDeck: async () => ({
      userId: ownerId,
      companyName: "Example Company",
      status: "delivered",
      runStatus: "delivered",
      artifacts: { presentationDelivery: artifact },
      shareCheckpoints: {
        planning: readyPlanningCheckpoint(),
        rendering: artifact,
      },
    }),
    resolveIntegrationConfig: async () => ({
      presentonBaseUrl: "https://renderer.example.test",
      presentonAuthUsername: fixtureUsername,
      presentonAuthPassword: fixturePassword,
      allowPrivateProviderUrls: false,
    }),
    resolveSafeOutboundTarget: async () => ({
      address: "203.0.113.10",
      family: 4,
    }),
    requestBytes: async () => ({
      status: 200,
      body: pptxBody,
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    ...overrides,
  };
}

function invoke(handler: ReturnType<typeof createDeliveryDownloadHandler>) {
  return handler(
    new Request("https://app.example.test/api/delivery/deck-fixture/download"),
    { params: Promise.resolve({ deckId: "deck-fixture" }) },
  );
}

test("delivery download authenticates, pins, verifies, and returns a private attachment", async () => {
  const artifactUrl = "https://renderer.example.test/exports/deck.pptx?token=transient";
  let resolveCalls = 0;
  let capturedPolicy: { allowPrivateNetwork?: boolean } | undefined;
  let capturedOptions: Parameters<DeliveryDownloadDependencies["requestBytes"]>[1] | undefined;
  const handler = createDeliveryDownloadHandler(dependencies(
    deliveredArtifact(
      artifactUrl,
      pptxBody,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ),
    {
      getOwnedDeliveryDeck: async (deckId, userId) => {
        assert.equal(deckId, "deck-fixture");
        assert.equal(userId, ownerId);
        return {
          userId: ownerId,
          companyName: "Acme\r\nContent-Length: 0 / Démo",
          status: "delivered",
          runStatus: "delivered",
          artifacts: {
            presentationDelivery: deliveredArtifact(artifactUrl, pptxBody),
          },
          shareCheckpoints: {
            planning: readyPlanningCheckpoint(),
            rendering: deliveredArtifact(artifactUrl, pptxBody),
          },
        };
      },
      resolveIntegrationConfig: async (userId) => {
        resolveCalls += 1;
        assert.equal(userId, ownerId);
        return {
          presentonBaseUrl: "https://renderer.example.test",
          presentonAuthUsername: fixtureUsername,
          presentonAuthPassword: fixturePassword,
          allowPrivateProviderUrls: true,
        };
      },
      resolveSafeOutboundTarget: async (url, policy) => {
        assert.equal(url, artifactUrl);
        capturedPolicy = policy;
        return { address: "192.0.2.10", family: 4 };
      },
      requestBytes: async (url, options) => {
        assert.equal(url, artifactUrl);
        capturedOptions = options;
        return {
          status: 200,
          body: pptxBody,
          contentType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        };
      },
    },
  ));

  const response = await invoke(handler);

  assert.equal(response.status, 200);
  assert.equal(resolveCalls, 1);
  assert.deepEqual(capturedPolicy, { allowPrivateNetwork: true });
  assert.equal(capturedOptions?.pinnedAddress, "192.0.2.10");
  assert.equal(capturedOptions?.pinnedFamily, 4);
  assert.equal(capturedOptions?.maxResponseBytes, MAX_DELIVERY_ARTIFACT_BYTES);
  assert.equal(capturedOptions?.timeoutMs, 60_000);
  assert.equal(
    capturedOptions?.headers?.Authorization,
    `Basic ${Buffer.from(`${fixtureUsername}:${fixturePassword}`).toString("base64")}`,
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="Acme-Content-Length-0-Demo-proposal.pptx"',
  );
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pptxBody);
});

test("hosted Presenton allows its artifact CDN without forwarding bearer auth", async () => {
  const artifactUrl =
    "https://presenton-public.s3.amazonaws.com/exports/deck.pdf?signature=fixture";
  let capturedAuthorization: string | undefined;
  const handler = createDeliveryDownloadHandler(dependencies(
    deliveredArtifact(artifactUrl, pdfBody, "application/pdf"),
    {
      resolveIntegrationConfig: async () => ({
        presentonBaseUrl: "https://api.presenton.ai",
        presentonApiKey: fixtureBearer,
        allowPrivateProviderUrls: false,
      }),
      requestBytes: async (_url, options) => {
        capturedAuthorization = options.headers?.Authorization;
        return { status: 200, body: pdfBody, contentType: "application/pdf" };
      },
    },
  ));

  const response = await invoke(handler);

  assert.equal(response.status, 200);
  assert.equal(capturedAuthorization, undefined);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdfBody);
});

test("self-hosted Presenton rejects off-origin artifacts before DNS or HTTP", async () => {
  const artifactUrl = "https://untrusted.example.test/deck.pptx";
  let resolverCalls = 0;
  let requestCalls = 0;
  const handler = createDeliveryDownloadHandler(dependencies(
    deliveredArtifact(artifactUrl, pptxBody),
    {
      resolveSafeOutboundTarget: async () => {
        resolverCalls += 1;
        return { address: "203.0.113.10", family: 4 };
      },
      requestBytes: async () => {
        requestCalls += 1;
        return { status: 200, body: pptxBody };
      },
    },
  ));

  const response = await invoke(handler);

  assert.equal(response.status, 410);
  assert.equal(resolverCalls, 0);
  assert.equal(requestCalls, 0);
  assert.equal((await response.json()).code, "artifact_unavailable");
});

test("delivery download hides both missing and cross-tenant decks", async () => {
  const missingHandler = createDeliveryDownloadHandler(dependencies(undefined, {
    getOwnedDeliveryDeck: async () => null,
  }));
  const wrongOwnerHandler = createDeliveryDownloadHandler(dependencies(undefined, {
    getOwnedDeliveryDeck: async () => ({
      userId: "different-owner",
      companyName: "Private Company",
      status: "delivered",
      runStatus: "delivered",
      artifacts: {},
      shareCheckpoints: {},
    }),
  }));

  for (const handler of [missingHandler, wrongOwnerHandler]) {
    const response = await invoke(handler);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).code, "deck_not_found");
  }
});

test("delivery download rejects unauthenticated requests before deck lookup", async () => {
  let deckLookups = 0;
  const handler = createDeliveryDownloadHandler(dependencies(undefined, {
    getSession: async () => null,
    getOwnedDeliveryDeck: async () => {
      deckLookups += 1;
      return null;
    },
  }));

  const response = await invoke(handler);

  assert.equal(response.status, 401);
  assert.equal(deckLookups, 0);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("legacy and malformed delivery artifacts fail closed without network access", async () => {
  const artifacts: unknown[] = [
    undefined,
    { provider: "plusai", download_url: "https://example.test/deck.pptx" },
    { outcome: "delivered" },
    deliveredArtifact("not-an-absolute-url", pptxBody),
  ];

  for (const artifact of artifacts) {
    let requestCalls = 0;
    const handler = createDeliveryDownloadHandler(dependencies(artifact, {
      requestBytes: async () => {
        requestCalls += 1;
        return { status: 200, body: pptxBody };
      },
    }));
    const response = await invoke(handler);
    assert.equal(response.status, 410);
    assert.equal(requestCalls, 0);
  }
});

test("delivery requires delivered target state and both exact committed checkpoints", async () => {
  const artifactUrl = "https://renderer.example.test/exports/deck.pptx";
  const artifact = deliveredArtifact(artifactUrl, pptxBody);
  const unverifiedVisualArtifact = structuredClone(artifact);
  unverifiedVisualArtifact.readiness.visualProfileVerified = false;
  const mismatchedVisualArtifact = structuredClone(artifact);
  mismatchedVisualArtifact.verification.visualProfile = richStaticVisualProfileFixture(2);
  const cases = [
    { status: "rendering", planning: readyPlanningCheckpoint(), rendering: artifact },
    { status: "failed", planning: readyPlanningCheckpoint(), rendering: artifact },
    { status: "cancelled", planning: readyPlanningCheckpoint(), rendering: artifact },
    { status: "delivered", planning: undefined, rendering: artifact },
    { status: "delivered", planning: readyPlanningCheckpoint(), rendering: undefined },
    {
      status: "delivered",
      planning: readyPlanningCheckpoint(),
      rendering: unverifiedVisualArtifact,
    },
    {
      status: "delivered",
      planning: readyPlanningCheckpoint(),
      rendering: mismatchedVisualArtifact,
    },
    {
      status: "delivered",
      planning: {
        ...readyPlanningCheckpoint(),
        plan: {
          ...readyPlanningCheckpoint().plan,
          slides: [{
            ...readyPlanningCheckpoint().plan.slides[0],
            headline: "Invented after planning",
          }],
        },
      },
      rendering: artifact,
    },
  ];

  for (const fixture of cases) {
    let requestCalls = 0;
    const handler = createDeliveryDownloadHandler(dependencies(artifact, {
      getOwnedDeliveryDeck: async () => ({
        userId: ownerId,
        companyName: "Example Company",
        status: fixture.status,
        runStatus: "delivered",
        artifacts: { presentationDelivery: artifact },
        shareCheckpoints: {
          planning: fixture.planning,
          rendering: fixture.rendering,
        },
      }),
      requestBytes: async () => {
        requestCalls += 1;
        return { status: 200, body: pptxBody };
      },
    }));

    const response = await invoke(handler);
    assert.equal(response.status, 410);
    assert.equal((await response.json()).code, "artifact_unavailable");
    assert.equal(requestCalls, 0);
  }
});

test("delivery refuses a delivered target when its run is cancelled", async () => {
  const artifactUrl = "https://renderer.example.test/exports/deck.pptx";
  const artifact = deliveredArtifact(artifactUrl, pptxBody);
  let requestCalls = 0;
  const handler = createDeliveryDownloadHandler(dependencies(artifact, {
    getOwnedDeliveryDeck: async () => ({
      userId: ownerId,
      companyName: "Cancelled Company",
      status: "delivered",
      runStatus: "cancelled",
      artifacts: { presentationDelivery: artifact },
      shareCheckpoints: {
        planning: readyPlanningCheckpoint(),
        rendering: artifact,
      },
    }),
    requestBytes: async () => {
      requestCalls += 1;
      return { status: 200, body: pptxBody };
    },
  }));

  const response = await invoke(handler);
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "artifact_unavailable");
  assert.equal(requestCalls, 0);
});

test("redirects, HTML responses, and integrity mismatches are never served", async () => {
  const artifactUrl = "https://renderer.example.test/exports/deck.pptx";
  const cases = [
    { status: 302, body: pptxBody, contentType: "application/octet-stream" },
    { status: 200, body: pptxBody, contentType: "text/html" },
    {
      status: 200,
      body: Buffer.concat([pptxBody, Buffer.from("changed")]),
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
    { status: 200, body: Buffer.from("<html>not a deck</html>"), contentType: "text/html" },
  ];

  for (const remoteResponse of cases) {
    const handler = createDeliveryDownloadHandler(dependencies(
      deliveredArtifact(artifactUrl, pptxBody),
      { requestBytes: async () => remoteResponse },
    ));
    const response = await invoke(handler);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, "artifact_fetch_failed");
  }
});

test("delivery downloads cap concurrent memory-heavy fetches per owner", async () => {
  const artifactUrl = "https://renderer.example.test/exports/deck.pptx";
  const pending: Array<(value: {
    status: number;
    body: Buffer;
    contentType: string;
  }) => void> = [];
  let requestCalls = 0;
  const handler = createDeliveryDownloadHandler(dependencies(
    deliveredArtifact(artifactUrl, pptxBody),
    {
      requestBytes: async () => {
        requestCalls += 1;
        return new Promise((resolve) => pending.push(resolve));
      },
    },
  ));

  const firstPromise = invoke(handler);
  const secondPromise = invoke(handler);
  while (requestCalls < 2) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  const limited = await invoke(handler);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "5");
  assert.equal((await limited.json()).code, "download_limited");
  assert.equal(requestCalls, 2);

  for (const resolve of pending) {
    resolve({
      status: 200,
      body: pptxBody,
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  }
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  await Promise.all([first.arrayBuffer(), second.arrayBuffer()]);
});

test("verified response reservations survive unread bodies and settle exactly once", async () => {
  const artifactUrl = "https://renderer.example.test/exports/deck.pptx";
  let requestCalls = 0;
  const handler = createDeliveryDownloadHandler(dependencies(
    deliveredArtifact(artifactUrl, pptxBody),
    {
      requestBytes: async () => {
        requestCalls += 1;
        return {
          status: 200,
          body: pptxBody,
          contentType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        };
      },
    },
  ));

  const first = await invoke(handler);
  const second = await invoke(handler);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  // Both verified buffers are still resident behind unread bodies. A third
  // response would exceed the per-user retained-memory budget.
  const unreadLimited = await invoke(handler);
  assert.equal(unreadLimited.status, 429);
  assert.equal(requestCalls, 2);

  assert.ok(first.body);
  await first.body.cancel();
  const afterCancel = await invoke(handler);
  assert.equal(afterCancel.status, 200);
  assert.equal(requestCalls, 3);

  // Cancellation released one slot, exactly once: the still-unread second
  // response and its replacement continue to occupy both slots.
  const afterCancelLimited = await invoke(handler);
  assert.equal(afterCancelLimited.status, 429);
  assert.equal(requestCalls, 3);

  assert.deepEqual(Buffer.from(await second.arrayBuffer()), pptxBody);
  const afterConsume = await invoke(handler);
  assert.equal(afterConsume.status, 200);
  assert.equal(requestCalls, 4);

  // Draining also released one slot, exactly once.
  const afterConsumeLimited = await invoke(handler);
  assert.equal(afterConsumeLimited.status, 429);
  assert.equal(requestCalls, 4);

  await Promise.all([afterCancel.arrayBuffer(), afterConsume.arrayBuffer()]);
});

test("unread verified responses retain the global reservation budget", async () => {
  const artifactUrl = "https://renderer.example.test/exports/deck.pptx";
  const artifact = deliveredArtifact(artifactUrl, pptxBody);
  let requestCalls = 0;
  const handlerForUser = (userId: string) => createDeliveryDownloadHandler(dependencies(
    artifact,
    {
      getSession: async () => ({ user: { id: userId } }),
      getOwnedDeliveryDeck: async () => ({
        userId,
        companyName: "Example Company",
        status: "delivered",
        runStatus: "delivered",
        artifacts: { presentationDelivery: artifact },
        shareCheckpoints: {
          planning: readyPlanningCheckpoint(),
          rendering: artifact,
        },
      }),
      requestBytes: async () => {
        requestCalls += 1;
        return {
          status: 200,
          body: pptxBody,
          contentType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        };
      },
    },
  ));

  const held = await Promise.all(
    ["global-owner-a", "global-owner-b", "global-owner-c", "global-owner-d"]
      .map((userId) => invoke(handlerForUser(userId))),
  );
  assert.deepEqual(held.map(({ status }) => status), [200, 200, 200, 200]);

  const globallyLimited = await invoke(handlerForUser("global-owner-e"));
  assert.equal(globallyLimited.status, 429);
  assert.equal(requestCalls, 4);

  assert.ok(held[0]?.body);
  await held[0].body.cancel();
  const replacement = await invoke(handlerForUser("global-owner-f"));
  assert.equal(replacement.status, 200);
  assert.equal(requestCalls, 5);

  // Releasing one global slot cannot under-count the other three unread
  // buffers or the replacement.
  assert.equal((await invoke(handlerForUser("global-owner-g"))).status, 429);
  assert.equal(requestCalls, 5);

  await Promise.all([
    ...held.slice(1).map((response) => response.arrayBuffer()),
    replacement.arrayBuffer(),
  ]);
});

test("egress deadlines error abandoned bodies and release reservations exactly once", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const artifactUrl = "https://renderer.example.test/exports/deck.pptx";
  let requestCalls = 0;
  const handler = createDeliveryDownloadHandler(dependencies(
    deliveredArtifact(artifactUrl, pptxBody),
    {
      requestBytes: async () => {
        requestCalls += 1;
        return {
          status: 200,
          body: pptxBody,
          contentType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        };
      },
    },
  ));

  const abandonedFirst = await invoke(handler);
  const abandonedSecond = await invoke(handler);
  assert.equal(abandonedFirst.status, 200);
  assert.equal(abandonedSecond.status, 200);
  assert.equal((await invoke(handler)).status, 429);

  t.mock.timers.tick(2 * 60_000);

  await assert.rejects(
    abandonedFirst.arrayBuffer(),
    /Deck download response deadline exceeded/u,
  );
  await assert.rejects(
    abandonedSecond.arrayBuffer(),
    /Deck download response deadline exceeded/u,
  );

  const replacementFirst = await invoke(handler);
  const replacementSecond = await invoke(handler);
  assert.equal(replacementFirst.status, 200);
  assert.equal(replacementSecond.status, 200);
  assert.equal(requestCalls, 4);

  // Each expired stream settled once: two new streams fill the two slots and
  // a third remains limited rather than observing an under-count.
  assert.equal((await invoke(handler)).status, 429);
  assert.equal(requestCalls, 4);
  await Promise.all([replacementFirst.arrayBuffer(), replacementSecond.arrayBuffer()]);
});

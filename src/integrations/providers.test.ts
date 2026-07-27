import assert from "node:assert/strict";
import test from "node:test";

import {
  reportProviderObservability,
  type CrawlRequest,
} from "./providers";

const request: CrawlRequest = {
  websiteUrl: "https://example.com",
  requestedFormats: ["markdown"],
};

test("crawl requests do not expose the retired fallback exception flag", () => {
  assert.deepEqual(request, {
    websiteUrl: "https://example.com",
    requestedFormats: ["markdown"],
  });
  assert.equal("userApprovedException" in request, false);
});

test("observability callback failures cannot invalidate provider success", () => {
  assert.doesNotThrow(() => reportProviderObservability({
    onObservability() {
      throw new Error("local metrics sink failed");
    },
  }, {
    usage: [{ metric: "requests", unit: "calls", amount: 1 }],
  }));
});

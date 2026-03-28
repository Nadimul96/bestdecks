import test from "node:test";
import assert from "node:assert/strict";

import { PlusAiDeckProvider } from "@/src/integrations/plusai";
import { PresentonDeckProvider } from "@/src/integrations/presenton";
import {
  createDeckProvider,
  hasDeckProviderConfig,
} from "./deck-provider";

test("hasDeckProviderConfig recognizes configured providers", () => {
  assert.equal(hasDeckProviderConfig({}), false);
  assert.equal(hasDeckProviderConfig({ plusaiApiKey: "plus-key" }), true);
  assert.equal(hasDeckProviderConfig({ presentonBaseUrl: "https://presenton.test" }), true);
});

test("createDeckProvider prefers Plus AI when both providers are configured", () => {
  const provider = createDeckProvider({
    plusaiApiKey: "plus-key",
    presentonBaseUrl: "https://presenton.test",
    presentonApiKey: "presenton-key",
    presentonTemplate: "modern",
  });

  assert.equal(provider instanceof PlusAiDeckProvider, true);
  assert.equal(provider.name, "plusai");
});

test("createDeckProvider falls back to Presenton", () => {
  const provider = createDeckProvider({
    presentonBaseUrl: "https://presenton.test",
    presentonApiKey: "presenton-key",
    presentonTemplate: "modern",
  });

  assert.equal(provider instanceof PresentonDeckProvider, true);
  assert.equal(provider.name, "presenton");
});

test("createDeckProvider throws without provider settings", () => {
  assert.throws(
    () => createDeckProvider({}),
    /No deck provider configured/,
  );
});

import { AlaiDeckProvider } from "@/src/integrations/alai";
import { PlusAiDeckProvider } from "@/src/integrations/plusai";
import { PresentonDeckProvider } from "@/src/integrations/presenton";
import type { DeckProvider } from "@/src/integrations/providers";

export interface DeckProviderSettings {
  alaiApiKey?: string;
  plusaiApiKey?: string;
  presentonBaseUrl?: string;
  presentonApiKey?: string;
  presentonTemplate?: string;
}

export function hasDeckProviderConfig(settings: DeckProviderSettings) {
  return Boolean(settings.alaiApiKey || settings.plusaiApiKey || settings.presentonBaseUrl);
}

export function createDeckProvider(settings: DeckProviderSettings): DeckProvider {
  // Priority: Alai > Plus AI > Presenton
  if (settings.alaiApiKey) {
    return new AlaiDeckProvider({ apiKey: settings.alaiApiKey });
  }

  if (settings.plusaiApiKey) {
    return new PlusAiDeckProvider({ apiKey: settings.plusaiApiKey });
  }

  if (settings.presentonBaseUrl) {
    return new PresentonDeckProvider({
      baseUrl: settings.presentonBaseUrl,
      apiKey: settings.presentonApiKey,
      defaultTemplate: settings.presentonTemplate,
    });
  }

  throw new Error("No deck provider configured. Set ALAI_API_KEY, PLUSAI_API_KEY, or PRESENTON_BASE_URL.");
}

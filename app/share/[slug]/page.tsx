import { notFound } from "next/navigation";

import { ShareableDeckViewer } from "@/components/shareable-deck-viewer";
import { getPublicShareableDeck } from "@/src/server/repository";

export const dynamic = "force-dynamic";

export default async function ShareableDeckPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const deck = await getPublicShareableDeck(slug, { incrementViews: true });

  if (!deck) {
    notFound();
  }

  return (
    <ShareableDeckViewer
      title={deck.viewer.title}
      preparedFor={deck.viewer.preparedFor}
      targetWebsiteUrl={deck.target.websiteUrl}
      watermark={deck.viewer.watermark}
      coverEyebrow={deck.viewer.coverEyebrow}
      coverFooter={deck.viewer.coverFooter}
      defaultThemeKey={deck.viewer.defaultThemeKey}
      slides={deck.viewer.slides}
    />
  );
}

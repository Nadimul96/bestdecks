# Synthetic evidence-ledger example

**Sample data.** The organizations, offer, and narrative are fictional. This file demonstrates
claim classification and exact slide-to-evidence mapping; it is not a customer deck, performance
case study, or live-provider receipt.

## Inputs

- Target source: `https://example.com/`
- Seller-supplied offer: `Seller provides evidence-backed proposal decks.`
- Seller-supplied CTA: `Book a discovery call.`

## Intended slides

1. Source-backed fact: `Example Domain is reserved for documentation examples.`
2. Seller-supplied offer: `Seller provides evidence-backed proposal decks.`
3. Model inference: `[Inference] A source-linked proposal may help the buyer evaluate fit.`
4. Seller-supplied CTA: `Book a discovery call.`

Every rendered headline has one claim ID in `sample-deck-plan.json`. The only external factual
claim cites the supplied source. The inference is visibly labeled and is not counted as sourced
fact. No invented customer, conversion, timing, scale, or quality metric appears in the fixture.

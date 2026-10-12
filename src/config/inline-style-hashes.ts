/**
 * Sonner (the toast library) injects its stylesheet at runtime through a bare
 * `<style>` element and has no nonce option: it appends the element empty,
 * then fills it with its CSS. The strict nonce CSP blocked both steps, so
 * toasts rendered unstyled in production. Both exact contents are allowed by
 * hash instead of loosening `style-src-elem`. A unit test recomputes the hash
 * from the installed package, so a Sonner upgrade that changes its CSS fails
 * CI rather than silently unstyling toasts.
 */
export const SONNER_INLINE_STYLE_HASHES = [
  // The empty element Sonner appends before inserting its CSS.
  "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
  // Sonner 2.0.8's stylesheet.
  "sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=",
] as const;

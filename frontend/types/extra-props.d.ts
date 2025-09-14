// frontend/types/extra-props.d.ts
// Compile-time shim to allow legacy props without refactors.
// This does NOT change runtime behavior; it only relaxes TS checking.

declare namespace JSX {
  interface IntrinsicAttributes {
    deckId?: any;
    onAdded?: any;
  }
}

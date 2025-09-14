// frontend/types/editoraddbar-augment.d.ts
// TS-only augmentation so usages with deckId/onAdded type-check.
// Does not change runtime implementation of the component.
declare module "@/components/EditorAddBar" {
  import * as React from "react";
  export interface EditorAddBarProps {
    onAdd?: (name: string, qty: number) => void | Promise<void>;
    placeholder?: string;
    deckId?: any;
    onAdded?: any;
  }
  const EditorAddBar: React.FC<EditorAddBarProps>;
  export default EditorAddBar;
}

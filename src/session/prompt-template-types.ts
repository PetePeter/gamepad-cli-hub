/**
 * Data model for the global prompt-template library.
 * Tree of PromptFolder nodes containing PromptTemplate leaves.
 * IDs are UUIDs; parentId references another folder (null = root).
 * order determines sibling display order.
 */

/** A folder node in the template tree. */
export interface PromptFolder {
  id: string;
  name: string;
  parentId: string | null; // null = root-level folder
  order: number;
}

/** A template leaf in the template tree. */
export interface PromptTemplate {
  id: string;
  name: string;
  body: string; // sequence syntax — {Enter}, {Wait 500}, plain text, etc.
  parentId: string | null; // folder it lives in (null = root-level template)
  order: number;
}

/** Union type for any node in the tree. */
export type PromptNode = PromptFolder | PromptTemplate;

/** Type guard: true when node is a folder. */
export function isFolder(node: PromptNode): node is PromptFolder {
  return 'body' in node === false;
}

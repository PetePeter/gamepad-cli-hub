/**
 * Runtime session group — an ad-hoc grouping of sessions that cuts across
 * working directories.
 *
 * A session belongs to AT MOST ONE runtime group (exclusive membership). Groups
 * persist independently of their membership, so an empty group is a valid,
 * intentional state and is kept until explicitly closed.
 */
export interface RuntimeGroup {
  /** Unique group identifier (UUID). */
  id: string;
  /** User-facing display name. */
  name: string;
  /** Member session ids. Exclusive membership; array order = display order. */
  sessionIds: string[];
  /** Whether the group is collapsed in the sidebar. */
  collapsed: boolean;
  /** Epoch ms the group was created. */
  createdAt: number;
  /** Epoch ms of the last mutation to this group. */
  updatedAt: number;
}

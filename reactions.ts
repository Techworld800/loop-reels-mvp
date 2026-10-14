// The reactions people can leave on a reel. Used by both the UI and the API.
export const REACTIONS = ['❤️', '🔥', '😂', '💀', '👏'] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

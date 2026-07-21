// Who authored a stored turn. Deliberately narrower than the chat port's ChatRole:
// tool turns are server-side plumbing and are never persisted, so there is no TOOL
// member here to accidentally write one.
export const AiMessageRole = {
  USER: 'USER',
  MODEL: 'MODEL',
} as const;

export type AiMessageRole = (typeof AiMessageRole)[keyof typeof AiMessageRole];

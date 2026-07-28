export type LocalIntent =
  | "LIST_MODELS"
  | "CURRENT_MODEL"
  | "CURRENT_STATUS"
  | "SHOW_HELP";

const LIST_MODELS_PATTERNS = [
  /^어떤\s*모델이?\s*(있|있지|있어)\??$/i,
  /^모델\s*(뭐|무엇)\s*(있|있어)\??$/i,
  /^사용\s*가능한\s*모델\s*(알려줘|목록)?$/i,
  /^모델\s*목록$/i,
  /^nvidia\s*모델\s*목록$/i,
  /^what\s+models\s+are\s+available\??$/i,
  /^list\s+models$/i,
  /^show\s+models$/i,
];

const CURRENT_MODEL_PATTERNS = [
  /^너\s*(무슨|어떤)\s*모델이야\??$/i,
  /^지금\s*(무슨|어떤)\s*모델이야\??$/i,
  /^현재\s*모델이?\s*(뭐야|무엇이야)\??$/i,
  /^what\s+model\s+are\s+you\??$/i,
];

const CURRENT_STATUS_PATTERNS = [
  /^현재\s*상태\s*(알려줘|표시)?$/i,
  /^연결\s*상태$/i,
  /^세션\s*상태$/i,
  /^status$/i,
];

export function detectLocalIntent(input: string): LocalIntent | null {
  const trimmed = input.trim();

  for (const pattern of LIST_MODELS_PATTERNS) {
    if (pattern.test(trimmed)) return "LIST_MODELS";
  }

  for (const pattern of CURRENT_MODEL_PATTERNS) {
    if (pattern.test(trimmed)) return "CURRENT_MODEL";
  }

  for (const pattern of CURRENT_STATUS_PATTERNS) {
    if (pattern.test(trimmed)) return "CURRENT_STATUS";
  }

  return null;
}

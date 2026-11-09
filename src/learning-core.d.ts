export function familiarity(
  vocabulary: Record<string, number>,
  lemma: string,
  reading: string,
  completedLevel: number,
  overrides: Record<string, boolean>,
): "known" | "unknown" | "unlisted";

export function estimateVocabulary(
  vocabulary: Record<string, number>,
  tokens: { word: boolean; pos: string; lemma: string; reading: string }[],
  level: number,
  knowledge: Record<string, boolean>,
): {
  known: number;
  unknown: number;
  unrated: number;
  total: number;
  lower: number;
  upper: number;
} | null;

export function shouldHighlightToken(
  vocabulary: Record<string, number>,
  token: {
    word: boolean;
    lemma: string;
    reading: string;
    pos: string;
    proper?: boolean;
    detail?: string;
  },
  level: number,
  knowledge: Record<string, boolean>,
): boolean;

// Community JLPT estimates; attribution and the pinned source are in src/data and licenses.
import levels from "./data/jlpt-levels.json";
import { familiarity as classify } from "./learning-core";
export type JlptLevel = 1 | 2 | 3 | 4 | 5;
const vocabulary: Record<string, number> = levels;
export function familiarity(
  lemma: string,
  reading: string,
  completedLevel: JlptLevel,
  overrides: Record<string, boolean>,
): "known" | "unknown" | "unlisted" {
  return classify(vocabulary, lemma, reading, completedLevel, overrides);
}
export function showFurigana(
  lemma: string,
  reading: string,
  completedLevel: JlptLevel,
  overrides: Record<string, boolean>,
  enabled: boolean,
): boolean {
  return (
    enabled &&
    familiarity(lemma, reading, completedLevel, overrides) === "unknown"
  );
}

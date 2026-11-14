import type { SQLiteDatabase } from "expo-sqlite";
import type { Cue } from "./subtitles";
export type DictionaryEntry = {
  id: string;
  word: string;
  reading: string;
  definitions: string;
};
export type Movie = {
  id: string;
  title: string;
  uri: string;
  position: number;
  subtitles: string;
};
export async function initialize(db: SQLiteDatabase) {
  await db.execAsync(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS movies(id TEXT PRIMARY KEY,title TEXT NOT NULL,uri TEXT NOT NULL,position REAL DEFAULT 0,subtitles TEXT DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS saved(entry_id TEXT PRIMARY KEY,context TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT);`);
}
export const movies = (db: SQLiteDatabase) =>
  db.getAllAsync<Movie>("SELECT * FROM movies ORDER BY rowid DESC");
export async function lookup(db: SQLiteDatabase, term: string) {
  const form = term.normalize("NFKC").trim().slice(0, 80);
  if (!form) return [];
  return db.getAllAsync<DictionaryEntry>(
    "SELECT e.* FROM entries e JOIN forms f ON f.entry_id=e.id WHERE f.form=? LIMIT 30",
    form,
  );
}
export async function captionTokens(
  db: SQLiteDatabase,
  caption: string,
): Promise<string[]> {
  const chars = Array.from(caption.slice(0, 500));
  const candidates = new Set<string>();
  for (let i = 0; i < chars.length; i++)
    for (let n = 1; n <= Math.min(16, chars.length - i); n++)
      candidates.add(chars.slice(i, i + n).join(""));
  const all = [...candidates],
    matches = new Set<string>();
  for (let i = 0; i < all.length; i += 400) {
    const batch = all.slice(i, i + 400);
    const rows = await db.getAllAsync<{ form: string }>(
      `SELECT DISTINCT form FROM forms WHERE form IN (${batch.map(() => "?").join(",")})`,
      ...batch,
    );
    rows.forEach((row) => matches.add(row.form));
  }
  const result: string[] = [];
  for (let i = 0; i < chars.length;) {
    let token = chars[i];
    for (let n = Math.min(16, chars.length - i); n > 1; n--) {
      const value = chars.slice(i, i + n).join("");
      if (matches.has(value)) {
        token = value;
        break;
      }
    }
    result.push(token);
    i += Array.from(token).length;
  }
  return result;
}
export function decodeCues(movie: Movie | null): Cue[] {
  if (!movie) return [];
  try {
    return JSON.parse(movie.subtitles) as Cue[];
  } catch {
    return [];
  }
}

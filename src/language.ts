import Constants from 'expo-constants';
import { Platform } from 'react-native';
export type AnalyzedToken = { text: string; word: boolean; lemma: string; reading: string; pos: string; proper?: boolean; grammar: string[]; start: number; end: number };
export const dictionaryKey = (token: AnalyzedToken) => token.proper ? `${token.lemma}:name:${token.reading}` : token.lemma;
export type GeneratedCue = { start: number; end: number; text: string };
export type Transcription = { status: 'processing' | 'ready' | 'busy' | 'unavailable'; message?: string; processedSeconds?: number; duration?: number; cues?: GeneratedCue[]; comparisons?: { start: number; end: number; selected: string | null; reason: string; agreement: number | null; candidates: { model: string; text: string; seconds?: number; error?: string }[] }[]; reason?: string; canRetry?: boolean };
export function serviceUrl(route: string, params: Record<string, string>) {
  let origin = '';
  if (Platform.OS !== 'web') {
    const host = Constants.expoConfig?.hostUri;
    if (!host) throw new Error('The language service needs the cloud preview server.');
    origin = `${host.includes('.expo.app') ? 'https' : 'http'}://${host}`;
  }
  return `${origin}/api/immersion/${route}?${new URLSearchParams(params)}`;
}
export async function languageRequest<T>(route: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(serviceUrl(route, params), { signal });
  if (!response.ok) throw new Error('Language service unavailable');
  return response.json();
}

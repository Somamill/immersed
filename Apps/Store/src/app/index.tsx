import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { getDocumentAsync } from "expo-document-picker";
import * as Files from "expo-file-system/legacy";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { speak, stop } from "expo-speech";
import { dotTokens } from "../../../../branding/dot/tokens";
import { activeCue, parseSubtitles } from "../lib/subtitles";
import {
  captionTokens,
  decodeCues,
  lookup,
  movies,
  type DictionaryEntry,
  type Movie,
} from "../lib/library";

type Tab = "watch" | "words" | "about";
const clock = (time: number) =>
  `${Math.floor(time / 60)}:${Math.floor(time % 60)
    .toString()
    .padStart(2, "0")}`;
function message(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}
export default function ImmersedStore() {
  const db = useSQLiteContext(),
    dark = useColorScheme() === "dark",
    { width } = useWindowDimensions();
  const palette = dotTokens.colors[dark ? "dark" : "light"];
  const accent = dotTokens.colors[dark ? "accentsDark" : "accents"].immersed;
  const s = useMemo(
    () =>
      styles(
        palette,
        accent,
        dotTokens.colors.onAccent[dark ? "dark" : "light"],
      ),
    [palette, accent, dark],
  );
  const [tab, setTab] = useState<Tab>("watch"),
    [library, setLibrary] = useState<Movie[]>([]),
    [current, setCurrent] = useState<Movie | null>(null);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [time, setTime] = useState(0),
    [query, setQuery] = useState("");
  const [entries, setEntries] = useState<DictionaryEntry[]>([]),
    [tokenResult, setTokenResult] = useState<{
      caption: string;
      tokens: string[];
    } | null>(null),
    [saved, setSaved] = useState<(DictionaryEntry & { context: string })[]>([]);
  const [lookupContext, setLookupContext] = useState('');
  const [selected, setSelected] = useState(""),
    [lookupBusy, setLookupBusy] = useState(false),
    [playing, setPlaying] = useState(false);
  const cues = useMemo(() => decodeCues(current), [current]);
  const cueIndex = activeCue(cues, time),
    cue = cues[cueIndex];
  const tokenCache = useRef(new Map<string, string[]>()),
    lookupSequence = useRef(0),
    lastSavedSecond = useRef(-1);
  const player = useVideoPlayer(current?.uri ?? null, (value) => {
    value.timeUpdateEventInterval = 0.25;
    if (current) value.currentTime = current.position;
  });
  const fail = useCallback((err: unknown) => setError(message(err)), []);
  const refresh = useCallback(async () => {
    const rows = await movies(db);
    setLibrary(rows);
    return rows;
  }, [db]);
  const refreshSaved = useCallback(
    async () =>
      setSaved(
        await db.getAllAsync<DictionaryEntry & { context: string }>(
          "SELECT e.*,s.context FROM saved s JOIN entries e ON e.id=s.entry_id ORDER BY s.created_at DESC",
        ),
      ),
    [db],
  );
  useEffect(() => {
    movies(db).then(setLibrary).catch(fail);
    db.getAllAsync<DictionaryEntry & { context: string }>(
      "SELECT e.*,s.context FROM saved s JOIN entries e ON e.id=s.entry_id ORDER BY s.created_at DESC",
    )
      .then(setSaved)
      .catch(fail);
  }, [db, fail]);
  useEventListener(player, "timeUpdate", (event) => {
    setTime(event.currentTime);
    const seconds = Math.floor(event.currentTime);
    if (current && seconds % 5 === 0 && seconds !== lastSavedSecond.current) {
      lastSavedSecond.current = seconds;
      db.runAsync(
        "UPDATE movies SET position=? WHERE id=?",
        event.currentTime,
        current.id,
      ).catch(fail);
    }
  });
  useEventListener(player, "playingChange", (event) =>
    setPlaying(event.isPlaying),
  );
  useEventListener(player, "statusChange", (event) => {
    if (event.status === "error")
      setError(
        "This video could not play. Import an unprotected MP4 or MOV supported by your device.",
      );
  });
  useEffect(() => {
    player.pause();
    stop();
  }, [player, tab]);
  useEffect(() => {
    let live = true;
    if (!cue) return;
    const cached = tokenCache.current.get(cue.text);
    if (cached) {
      Promise.resolve(cached).then((value) => {
        if (live) setTokenResult({ caption: cue.text, tokens: value });
      });
      return () => {
        live = false;
      };
    }
    captionTokens(db, cue.text)
      .then((value) => {
        if (tokenCache.current.size > 500) tokenCache.current.clear();
        tokenCache.current.set(cue.text, value);
        if (live) setTokenResult({ caption: cue.text, tokens: value });
      })
      .catch(fail);
    return () => {
      live = false;
    };
  }, [db, cue, fail]);
  const run = async (label: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (err) {
      fail(err);
    } finally {
      setBusy("");
    }
  };
  const search = async (word: string) => {
    const seq = ++lookupSequence.current;
    player.pause();
    setLookupContext(cue?.text || '');
    setSelected(word);
    setQuery(word);
    setLookupBusy(true);
    setError("");
    try {
      const found = await lookup(db, word);
      if (seq === lookupSequence.current) setEntries(found);
    } catch (err) {
      fail(err);
    } finally {
      if (seq === lookupSequence.current) setLookupBusy(false);
    }
  };
  const importMovie = () =>
    run("Importing video…", async () => {
      const result = await getDocumentAsync({
        type: "video/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!Files.documentDirectory)
        throw new Error("Local file storage is unavailable on this device.");
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const extension = asset.name.match(/\.[a-z0-9]{1,5}$/i)?.[0] || ".mp4";
      const directory = `${Files.documentDirectory}media/`,
        uri = `${directory}${id}${extension}`;
      await Files.makeDirectoryAsync(directory, { intermediates: true });
      try {
        await Files.copyAsync({ from: asset.uri, to: uri });
        await db.runAsync(
          "INSERT INTO movies(id,title,uri) VALUES(?,?,?)",
          id,
          asset.name,
          uri,
        );
      } catch (err) {
        await Files.deleteAsync(uri, { idempotent: true });
        throw err;
      } finally {
        await Files.deleteAsync(asset.uri, { idempotent: true }).catch(
          () => {},
        );
      }
      const rows = await refresh();
      setCurrent(rows.find((row) => row.id === id) || null);
      setTime(0);
      setTab("watch");
    });
  const importCaptions = () =>
    run("Reading subtitles…", async () => {
      if (!current) return;
      const result = await getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!/\.(srt|vtt)$/i.test(asset.name))
        throw new Error("Choose an SRT or WebVTT subtitle file.");
      try {
        if (asset.size && asset.size > 10_000_000)
          throw new Error("Choose a subtitle file smaller than 10 MB.");
        const parsed = parseSubtitles(await Files.readAsStringAsync(asset.uri));
        const subtitles = JSON.stringify(parsed);
        await db.runAsync(
          "UPDATE movies SET subtitles=? WHERE id=?",
          subtitles,
          current.id,
        );
        setCurrent({ ...current, subtitles });
        await refresh();
      } finally {
        await Files.deleteAsync(asset.uri, { idempotent: true }).catch(
          () => {},
        );
      }
    });
  // Expo VideoPlayer exposes an imperative native seek setter; this is an event handler.
  const seekCaption = () => {
    if (cue) {
      // eslint-disable-next-line react-hooks/immutability -- Expo VideoPlayer uses a native imperative seek setter in this event handler.
      player.currentTime = cue.start;
      player.play();
    }
  };
  const selectMovie = (movie: Movie) => {
    if (busy) return;
    player.pause();
    setCurrent(movie);
    setTime(movie.position);
    setEntries([]);
    setSelected("");
    lastSavedSecond.current = -1;
  };
  const saveWord = (entry: DictionaryEntry) =>
    run("Saving word…", async () => {
      await db.runAsync(
        "INSERT OR REPLACE INTO saved VALUES(?,?,?)",
        entry.id,
        lookupContext,
        Date.now(),
      );
      await refreshSaved();
    });
  const removeMovie = (movie: Movie) =>
    Alert.alert(
      "Remove this imported video?",
      "This removes the app’s copy and subtitles. The original file and saved words stay available.",
      [
        { text: "Keep video", style: "cancel" },
        {
          text: "Remove video",
          style: "destructive",
          onPress: () => {
            run("Removing video…", async () => {
              if (current?.id === movie.id) {
                player.pause();
                setCurrent(null);
              }
              await Files.deleteAsync(movie.uri, { idempotent: true });
              await db.runAsync("DELETE FROM movies WHERE id=?", movie.id);
              await refresh();
            });
          },
        },
      ],
    );
  const openLink = (url: string) => Linking.openURL(url).catch(fail);
  const entryView = (entry: DictionaryEntry, stored = false, context = "") => (
    <View key={entry.id} style={s.entry}>
      <Text selectable style={s.word}>
        {entry.word}
      </Text>
      <Text selectable style={s.secondary}>
        {entry.reading}
      </Text>
      <Text selectable style={s.body}>
        {entry.definitions}
      </Text>
      {context ? (
        <Text selectable style={s.context}>
          {context}
        </Text>
      ) : null}
      <View style={s.actions}>
        {
          <Action
            label={"Hear reading"}
            icon={"volume-medium-outline"}
            onPress={() =>
              speak(entry.reading.split(" / ")[0], { language: "ja-JP" })
            }
            primary={false}
            disabled={false}
            busy={!!busy}
            theme={{
              s,
              palette,
              onAccent: dotTokens.colors.onAccent[dark ? "dark" : "light"],
            }}
          />
        }
        {stored ? (
          <Action
            label={"Remove word"}
            icon={"bookmark-outline"}
            onPress={() => {
              run("Removing word…", async () => {
                await db.runAsync(
                  "DELETE FROM saved WHERE entry_id=?",
                  entry.id,
                );
                await refreshSaved();
              });
            }}
            primary={false}
            disabled={false}
            busy={!!busy}
            theme={{
              s,
              palette,
              onAccent: dotTokens.colors.onAccent[dark ? "dark" : "light"],
            }}
          />
        ) : (
          <Action
            label={
              saved.some((word) => word.id === entry.id) ? "Saved" : "Save word"
            }
            icon={"bookmark-outline"}
            onPress={() => {
              saveWord(entry);
            }}
            primary={false}
            disabled={saved.some((word) => word.id === entry.id)}
            busy={!!busy}
            theme={{
              s,
              palette,
              onAccent: dotTokens.colors.onAccent[dark ? "dark" : "light"],
            }}
          />
        )}
      </View>
    </View>
  );
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style={dark ? "light" : "dark"} />
      <View style={s.shell}>
        <View style={s.header}>
          <Text accessibilityRole="header" style={s.brand}>
            Immersed<Text style={s.accent}>.</Text>
          </Text>
          <Text style={s.suite}>dot.</Text>
        </View>
        <View accessibilityRole="tablist" style={s.tabs}>
          {(["watch", "words", "about"] as Tab[]).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              onPress={() => setTab(value)}
              style={({ pressed }) => [
                s.tab,
                tab === value && s.activeTab,
                pressed && s.pressed,
              ]}
            >
              <Text style={[s.tabText, tab === value && s.activeTabText]}>
                {value === "watch"
                  ? "Watch"
                  : value === "words"
                    ? "Saved words"
                    : "About"}
              </Text>
            </Pressable>
          ))}
        </View>
        {error ? (
          <View accessibilityRole="alert" style={s.error}>
            <Text style={s.body}>{error}</Text>
            {
              <Action
                label={"Dismiss"}
                icon={"close-outline"}
                onPress={() => setError("")}
                primary={false}
                disabled={false}
                busy={!!busy}
                theme={{
                  s,
                  palette,
                  onAccent: dotTokens.colors.onAccent[dark ? "dark" : "light"],
                }}
              />
            }
          </View>
        ) : null}
        {busy ? (
          <View accessibilityLiveRegion="polite" style={s.busy}>
            <ActivityIndicator color={accent} />
            <Text style={s.secondary}>{busy}</Text>
          </View>
        ) : null}
        {tab === "watch" ? (
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.actions}>
              {
                <Action
                  label={"Import video"}
                  icon={"add-outline"}
                  onPress={importMovie}
                  primary={true}
                  disabled={false}
                  busy={!!busy}
                  theme={{
                    s,
                    palette,
                    onAccent:
                      dotTokens.colors.onAccent[dark ? "dark" : "light"],
                  }}
                />
              }
              {current && (
                <Action
                  label={"Import subtitles"}
                  icon={"document-text-outline"}
                  onPress={importCaptions}
                  primary={false}
                  disabled={false}
                  busy={!!busy}
                  theme={{
                    s,
                    palette,
                    onAccent:
                      dotTokens.colors.onAccent[dark ? "dark" : "light"],
                  }}
                />
              )}
            </View>
            {!current ? (
              <View style={s.empty}>
                <Ionicons name="play-circle-outline" size={54} color={accent} />
                <Text accessibilityRole="header" style={s.title}>
                  Japanese, at your pace.
                </Text>
                <Text style={s.body}>
                  Import a video you own, add Japanese subtitles, and tap words
                  as you watch.
                </Text>
                <Text style={s.secondary}>
                  MP4 or MOV video. UTF-8 SRT or WebVTT subtitles. Your files
                  stay on this device.
                </Text>
              </View>
            ) : (
              <>
                <Text
                  accessibilityRole="header"
                  style={s.title}
                  numberOfLines={2}
                >
                  {current.title}
                </Text>
                <VideoView
                  player={player}
                  style={[s.video, { height: Math.min((width * 9) / 16, 420) }]}
                  nativeControls
                  contentFit="contain"
                  fullscreenOptions={{ enable: true }}
                />
                <View style={s.actions}>
                  {
                    <Action
                      label={playing ? "Pause" : "Play"}
                      icon={playing ? "pause-outline" : "play-outline"}
                      onPress={() => (playing ? player.pause() : player.play())}
                      primary={false}
                      disabled={false}
                      busy={!!busy}
                      theme={{
                        s,
                        palette,
                        onAccent:
                          dotTokens.colors.onAccent[dark ? "dark" : "light"],
                      }}
                    />
                  }
                  {
                    <Action
                      label={"Replay caption"}
                      icon={"repeat-outline"}
                      onPress={seekCaption}
                      primary={false}
                      disabled={!cue}
                      busy={!!busy}
                      theme={{
                        s,
                        palette,
                        onAccent:
                          dotTokens.colors.onAccent[dark ? "dark" : "light"],
                      }}
                    />
                  }
                  <Text style={s.secondary}>{clock(time)}</Text>
                </View>
                <View style={s.captions}>
                  {cue ? (
                    <Text style={s.caption}>
                      {(tokenResult?.caption === cue.text
                        ? tokenResult.tokens
                        : [cue.text]
                      ).map((token, index) => (
                        <Text
                          key={`${index}-${token}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Look up ${token}`}
                          onPress={() => {
                            search(token);
                          }}
                          style={s.captionWord}
                        >
                          {token}
                        </Text>
                      ))}
                    </Text>
                  ) : (
                    <Text style={s.secondary}>
                      {cues.length
                        ? "Captions will appear when their time begins."
                        : "Import a matching Japanese subtitle file to start tapping words."}
                    </Text>
                  )}
                </View>
              </>
            )}
            <View style={s.search}>
              <TextInput
                accessibilityLabel="Japanese dictionary search"
                placeholder="Japanese word"
                placeholderTextColor={palette.secondaryText}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => {
                  search(query);
                }}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                style={s.input}
              />
              {
                <Action
                  label={"Look up"}
                  icon={"search-outline"}
                  onPress={() => {
                    search(query);
                  }}
                  primary={false}
                  disabled={!query.trim()}
                  busy={!!busy}
                  theme={{
                    s,
                    palette,
                    onAccent:
                      dotTokens.colors.onAccent[dark ? "dark" : "light"],
                  }}
                />
              }
            </View>
            {lookupBusy ? (
              <ActivityIndicator color={accent} />
            ) : (
              entries.map((entry) => entryView(entry))
            )}
            {selected && !lookupBusy && !entries.length ? (
              <Text style={s.secondary}>
                No exact dictionary match for “{selected}”. Try its dictionary
                form or edit the search text.
              </Text>
            ) : null}
            {current && cues.length > 0 ? (
              <View style={s.section}>
                <Text accessibilityRole="header" style={s.sectionTitle}>
                  Transcript
                </Text>
                {cues
                  .slice(
                    Math.max(0, cueIndex - 3),
                    Math.max(0, cueIndex - 3) + 20,
                  )
                  .map((row, index) => (
                    <Pressable
                      key={`${row.start}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Seek to caption at ${clock(row.start)}: ${row.text}`}
                      onPress={() => {
                        player.currentTime = row.start;
                      }}
                      style={({ pressed }) => [
                        s.transcriptRow,
                        row === cue && s.currentCue,
                        pressed && s.pressed,
                      ]}
                    >
                      <Text style={s.timestamp}>{clock(row.start)}</Text>
                      <Text style={s.transcript}>{row.text}</Text>
                    </Pressable>
                  ))}
                <Text style={s.secondary}>
                  Showing captions near the current playback position.
                </Text>
              </View>
            ) : null}
            {library.length > 0 ? (
              <View style={s.section}>
                <Text accessibilityRole="header" style={s.sectionTitle}>
                  Your videos
                </Text>
                {library.map((movie) => (
                  <View key={movie.id} style={s.libraryRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${movie.title}`}
                      disabled={!!busy}
                        onPress={() => selectMovie(movie)}
                      style={({ pressed }) => [
                        s.movieTitle,
                        pressed && s.pressed,
                      ]}
                    >
                      <Text style={s.body}>{movie.title}</Text>
                      <Text style={s.secondary}>
                        Resume at {clock(movie.position)}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${movie.title}`}
                      onPress={() => removeMovie(movie)}
                      style={s.iconButton}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={21}
                        color={palette.secondaryText}
                      />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        ) : tab === "words" ? (
          <FlatList
            data={saved}
            keyExtractor={(entry) => entry.id}
            contentContainerStyle={s.content}
            renderItem={({ item }) => entryView(item, true, item.context)}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text accessibilityRole="header" style={s.title}>
                  Keep the words you meet.
                </Text>
                <Text style={s.body}>
                  Tap a subtitle word and choose Save word. Your vocabulary
                  stays on this device.
                </Text>
              </View>
            }
          />
        ) : (
          <ScrollView contentContainerStyle={s.content}>
            <Text accessibilityRole="header" style={s.title}>
              A space for Japanese.
            </Text>
            <Text style={s.secondary}>Version {Constants.expoConfig?.version}</Text>
            <Text style={s.body}>
              Immersed is part of dot. This Store edition plays your imported,
              unprotected videos and subtitles, with offline Japanese dictionary
              lookup and saved vocabulary.
            </Text>
            <Text style={s.body}>
              Import only media you own or have permission to use. Streaming
              extraction, downloading from video services, DRM bypass, and
              screen recording are not included.
            </Text>
            <Text accessibilityRole="header" style={s.sectionTitle}>
              Privacy
            </Text>
            <Text style={s.body}>
              Videos, subtitles, playback positions, searches, and saved words
              are processed on your device. There are no accounts, advertising,
              analytics, or tracking SDKs. The app does not send your media or
              lookups to a server. Apple’s system file picker may download a
              file from a cloud provider you choose. Support links open your
              browser or email app. Device backups follow your Apple settings.
            </Text>
            <Text style={s.body}>
              Remove videos and saved words in the app. Deleting the app removes
              its local data; backups may remain under your Apple account’s
              controls.
            </Text>
            {
              <Action
                label={"Contact support"}
                icon={"mail-outline"}
                onPress={() => {
                  openLink(
                    "mailto:k4jenx@gmail.com?subject=Immersed%20Store%20support",
                  );
                }}
                primary={false}
                disabled={false}
                busy={!!busy}
                theme={{
                  s,
                  palette,
                  onAccent: dotTokens.colors.onAccent[dark ? "dark" : "light"],
                }}
              />
            }
            <Action label="Read the privacy policy" icon="open-outline" onPress={() => { openLink('https://github.com/Somamill/immersed/blob/main/Apps/Store/PRIVACY.md'); }} busy={!!busy} theme={{s, palette, onAccent: dotTokens.colors.onAccent[dark ? 'dark' : 'light']}} />
            <Text accessibilityRole="header" style={s.sectionTitle}>
              Dictionary credits
            </Text>
            <Text style={s.body}>
              JMdict © Electronic Dictionary Research and Development Group
              (EDRDG), CC BY-SA 4.0. Source snapshot: 26 October 2026, via
              scriptin/jmdict-simplified. Converted to a local lookup index;
              definitions are preserved. This data remains available under the
              same license. Exact dictionary matches do not guarantee correct
              interpretation of every inflected word.
            </Text>
            {
              <Action
                label={"Dictionary source and license"}
                icon={"open-outline"}
                onPress={() => {
                  openLink("https://www.edrdg.org/edrdg/licence.html");
                }}
                primary={false}
                disabled={false}
                busy={!!busy}
                theme={{
                  s,
                  palette,
                  onAccent: dotTokens.colors.onAccent[dark ? "dark" : "light"],
                }}
              />
            }
            {
              <Action
                label={"Share-alike data and build script"}
                icon={"code-outline"}
                onPress={() => {
                  openLink(
                    "https://github.com/Somamill/immersed/tree/main/Apps/Store/scripts",
                  );
                }}
                primary={false}
                disabled={false}
                busy={!!busy}
                theme={{
                  s,
                  palette,
                  onAccent: dotTokens.colors.onAccent[dark ? "dark" : "light"],
                }}
              />
            }
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
function styles(
  p: typeof dotTokens.colors.light | typeof dotTokens.colors.dark,
  accent: string,
  onAccent: string,
) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: p.background },
    shell: { flex: 1, width: "100%", maxWidth: 1120, alignSelf: "center" },
    header: {
      flexWrap: "wrap",
      gap: 12,
      paddingHorizontal: 24,
      paddingVertical: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
    },
    brand: {
      fontSize: 30,
      fontWeight: "600",
      color: p.text,
      letterSpacing: -0.6,
    },
    accent: { color: accent },
    suite: { color: p.secondaryText, fontSize: 20 },
    tabs: {
      flexDirection: "row",
      flexWrap: "wrap",
      borderBottomWidth: 1,
      borderColor: p.border,
      marginHorizontal: 24,
    },
    tab: {
      minHeight: 48,
      paddingVertical: 12,
      paddingHorizontal: 16,
      justifyContent: "center",
    },
    activeTab: { borderBottomWidth: 3, borderColor: accent },
    tabText: { fontSize: 16, color: p.secondaryText },
    activeTabText: { color: p.text, fontWeight: "600" },
    content: { padding: 24, gap: 20, paddingBottom: 48 },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 12,
    },
    button: {
      minHeight: 48,
      borderRadius: 8,
      backgroundColor: p.surface,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
    },
    primary: { backgroundColor: accent },
    buttonText: {
      fontSize: 16,
      color: p.text,
      fontWeight: "500",
      flexShrink: 1,
    },
    primaryText: { color: onAccent },
    pressed: {
      transform: [{ translateY: 1 }],
      outlineColor: accent,
      outlineWidth: 2,
    },
    disabled: { opacity: 0.55 },
    empty: { paddingVertical: 48, gap: 20, maxWidth: 600 },
    title: {
      fontSize: 28,
      fontWeight: "600",
      letterSpacing: -0.5,
      color: p.text,
    },
    body: { fontSize: 17, lineHeight: 26, color: p.text },
    secondary: { fontSize: 15, lineHeight: 23, color: p.secondaryText },
    video: { width: "100%", backgroundColor: p.text, borderRadius: 8 },
    captions: {
      minHeight: 100,
      paddingVertical: 20,
      paddingHorizontal: 12,
      backgroundColor: p.surface,
      borderRadius: 8,
      justifyContent: "center",
    },
    caption: {
      fontSize: 30,
      lineHeight: 50,
      textAlign: "center",
      color: p.text,
    },
    captionWord: {
      textDecorationLine: "underline",
      textDecorationColor: p.border,
    },
    search: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    input: {
      minHeight: 48,
      minWidth: 200,
      flex: 1,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 8,
      paddingHorizontal: 14,
      fontSize: 17,
      color: p.text,
      backgroundColor: p.surface,
    },
    entry: {
      gap: 10,
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderColor: p.border,
    },
    word: { fontSize: 28, color: p.text, fontWeight: "500" },
    context: { fontSize: 18, lineHeight: 30, color: p.secondaryText },
    section: { gap: 16, paddingTop: 24 },
    sectionTitle: { fontSize: 22, fontWeight: "600", color: p.text },
    transcriptRow: {
      minHeight: 48,
      flexDirection: "row",
      gap: 16,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    timestamp: {
      width: 54,
      color: p.secondaryText,
      fontVariant: ["tabular-nums"],
      fontSize: 15,
      lineHeight: 26,
    },
    transcript: { flex: 1, color: p.text, fontSize: 18, lineHeight: 28 },
    currentCue: { backgroundColor: p.surface },
    libraryRow: {
      flexDirection: "row",
      gap: 12,
      borderBottomWidth: 1,
      borderColor: p.border,
      alignItems: "center",
    },
    movieTitle: { flex: 1, paddingVertical: 16, gap: 6 },
    iconButton: {
      minHeight: 48,
      minWidth: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    busy: { padding: 16, flexDirection: "row", gap: 12 },
    error: {
      padding: 16,
      margin: 24,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 8,
      gap: 12,
    },
  });
}

type Theme = {
  s: ReturnType<typeof styles>;
  palette: typeof dotTokens.colors.light | typeof dotTokens.colors.dark;
  onAccent: string;
};
function Action({
  label,
  icon,
  onPress,
  primary = false,
  disabled = false,
  busy,
  theme: { s, palette, onAccent },
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  busy: boolean;
  theme: Theme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary && s.primary,
        pressed && s.pressed,
        (disabled || busy) && s.disabled,
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={primary ? onAccent : palette.text}
      />
      <Text style={[s.buttonText, primary && s.primaryText]}>{label}</Text>
    </Pressable>
  );
}

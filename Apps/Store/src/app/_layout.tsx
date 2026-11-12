import { Component, type ReactNode } from "react";
import { Text, View, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SQLiteProvider } from "expo-sqlite";
import { Stack } from "expo-router";
import { initialize } from "../lib/library";
class StartupError extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <View style={styles.error}>
        <Text accessibilityRole="header">
          Immersed couldn’t open its local library.
        </Text>
        <Text>{this.state.error}</Text>
        <Text>
          Close and reopen the app. Your imported files remain on this device.
        </Text>
      </View>
    ) : (
      this.props.children
    );
  }
}
const styles = StyleSheet.create({
  error: { flex: 1, padding: 32, gap: 16, justifyContent: "center" },
});
export default function Layout() {
  return (
    <SafeAreaProvider>
      <StartupError>
        <SQLiteProvider
          databaseName="immersed-store.db"
          assetSource={{ assetId: require("../../assets/dictionary.db") }}
          onInit={initialize}
        >
          <Stack screenOptions={{ headerShown: false }} />
        </SQLiteProvider>
      </StartupError>
    </SafeAreaProvider>
  );
}

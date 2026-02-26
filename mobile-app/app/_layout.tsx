import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { api } from '../src/lib/api';

// ─── Mobile Error Boundary ────────────────────────────────────────────────────
interface EBState { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
    // Report to backend (best-effort)
    api.post('/logs/client', {
      type: 'react-boundary',
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      platform: 'mobile',
      ts: new Date().toISOString(),
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Ceva a mers prost</Text>
          <ScrollView style={styles.box}>
            <Text style={styles.msg}>{this.state.error?.message}</Text>
            {__DEV__ && (
              <Text style={styles.stack}>{this.state.error?.stack}</Text>
            )}
          </ScrollView>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.btnText}>Reîncearcă</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 8 },
  box: { maxHeight: 200, backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12, marginBottom: 20, width: '100%' },
  msg: { color: '#555', fontSize: 13 },
  stack: { color: '#9333ea', fontSize: 11, marginTop: 8 },
  btn: { backgroundColor: '#7c3aed', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});

// ─── Root Layout ──────────────────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <ErrorBoundary>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#ffffff' },
          headerTintColor: '#7c3aed',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Autentificare' }} />
        <Stack.Screen name="register" options={{ title: 'Înregistrare' }} />
        <Stack.Screen name="dashboard" options={{ title: 'Dashboard', headerShown: false }} />
        <Stack.Screen name="game/[matchId]" options={{ title: 'Joacă', headerShown: false }} />
        <Stack.Screen name="result/[matchId]" options={{ title: 'Rezultate' }} />
        <Stack.Screen name="leaderboard" options={{ title: 'Clasament' }} />
        <Stack.Screen name="invite/[code]" options={{ title: 'Invitație' }} />
      </Stack>
    </ErrorBoundary>
  );
}

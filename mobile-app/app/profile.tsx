import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { usersApi, statsApi } from '../src/lib/api';
import { User, UserGameStats } from '@integrame/shared';

const GAMES = ['integrame', 'slogane'];

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserGameStats[]>([]);
  const [selectedGame, setSelectedGame] = useState('integrame');

  useEffect(() => {
    usersApi.getMe().then((r: import('axios').AxiosResponse) => setUser(r.data)).catch(() => {});
    statsApi.getMyStats().then((r: import('axios').AxiosResponse) => setStats(r.data)).catch(() => {});
  }, []);

  const currentStats = stats.find((s) => s.gameType === selectedGame);
  const leagueColors: Record<string, string> = {
    bronze: '#cd7f32', silver: '#94a3b8', gold: '#f59e0b', platinum: '#0ea5e9', diamond: '#8b5cf6',
  };

  if (!user) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator color="#7c3aed" size="large" />
    </View>
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={s.header}>
        <Image
          source={{ uri: user.avatarUrl || `https://api.dicebear.com/8.x/personas/svg?seed=${user.username}` }}
          style={s.avatar}
        />
        <Text style={s.username}>{user.username}</Text>
        <Text style={s.email}>{user.email}</Text>
        <Text style={[s.league, { color: leagueColors[user.league] || '#7c3aed' }]}>
          {user.league?.toUpperCase()}
        </Text>
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statVal}>{user.rating}</Text>
            <Text style={s.statLbl}>ELO Rating</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statVal, { color: '#f59e0b' }]}>{user.xp} XP</Text>
            <Text style={s.statLbl}>Total XP</Text>
          </View>
        </View>
      </View>

      {/* Game selector */}
      <View style={s.gameRow}>
        {GAMES.map((g) => (
          <TouchableOpacity
            key={g}
            style={[s.pill, selectedGame === g && s.pillActive]}
            onPress={() => setSelectedGame(g)}
          >
            <Text style={[s.pillText, selectedGame === g && s.pillTextActive]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats grid */}
      {currentStats ? (
        <View style={s.grid}>
          {[
            { label: 'Meciuri', value: currentStats.totalMatches },
            { label: 'Victorii', value: currentStats.wins },
            { label: 'Win Rate', value: `${currentStats.totalMatches > 0 ? ((currentStats.wins / currentStats.totalMatches) * 100).toFixed(0) : 0}%` },
            { label: 'Best Score', value: currentStats.bestScore },
            { label: 'Streak curent', value: currentStats.currentStreak },
            { label: 'Best Streak', value: currentStats.bestStreak },
            { label: 'Score total', value: currentStats.totalScore },
            { label: 'Score mediu', value: currentStats.avgScore.toFixed(0) },
          ].map(({ label, value }) => (
            <View key={label} style={s.statCard}>
              <Text style={s.statCardVal}>{value}</Text>
              <Text style={s.statCardLbl}>{label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.noStats}>Nicio statistică disponibilă. Joacă un meci! 🎯</Text>
      )}

      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Text style={s.backBtnText}>← Înapoi la Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { backgroundColor: '#7c3aed', paddingTop: 52, paddingBottom: 24, alignItems: 'center', gap: 6 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#fff', marginBottom: 4 },
  username: { fontSize: 22, fontWeight: '800', color: '#fff' },
  email: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  league: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  statBox: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  statVal: { fontSize: 20, fontWeight: '800', color: '#fff' },
  statLbl: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  gameRow: { flexDirection: 'row', gap: 10, padding: 16 },
  pill: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 99, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  pillActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  pillTextActive: { color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10 },
  statCard: { width: '47%', backgroundColor: '#fafafa', borderRadius: 14, borderWidth: 1, borderColor: '#f3f4f6', padding: 16, alignItems: 'center' },
  statCardVal: { fontSize: 26, fontWeight: '800', color: '#1f2937' },
  statCardLbl: { fontSize: 11, color: '#9ca3af', marginTop: 4, textAlign: 'center' },
  noStats: { textAlign: 'center', color: '#9ca3af', fontSize: 15, marginTop: 30, paddingHorizontal: 30 },
  backBtn: { margin: 20, alignItems: 'center' },
  backBtnText: { color: '#7c3aed', fontWeight: '600', fontSize: 15 },
});

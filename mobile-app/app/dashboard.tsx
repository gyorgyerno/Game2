import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { usersApi, matchesApi } from '../src/lib/api';
import { User, GameLevel, MAX_PLAYERS_PER_LEVEL } from '@integrame/shared';

const GAMES = [
  { id: 'integrame', label: 'Integrame', emoji: '📝' },
  { id: 'slogane', label: 'Slogane', emoji: '💬' },
];
const LEVELS: GameLevel[] = [1, 2, 3, 4, 5];

export default function DashboardScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [selectedGame, setSelectedGame] = useState('integrame');
  const [selectedLevel, setSelectedLevel] = useState<GameLevel>(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    usersApi.getMe()
      .then((r: import('axios').AxiosResponse) => setUser(r.data))
      .catch(async () => {
        await SecureStore.deleteItemAsync('token');
        router.replace('/login');
      });
  }, []);

  async function handlePlay() {
    setLoading(true);
    try {
      const { data } = await matchesApi.findOrCreate(selectedGame, selectedLevel);
      router.push(`/game/${data.id}?gameType=${selectedGame}`);
    } catch {
      Alert.alert('Eroare', 'Nu s-a putut porni meciul');
    } finally { setLoading(false); }
  }

  async function handleLogout() {
    await SecureStore.deleteItemAsync('token');
    router.replace('/');
  }

  if (!user) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator color="#7c3aed" size="large" />
    </View>
  );

  const leagueColors: Record<string, string> = {
    bronze: '#cd7f32', silver: '#94a3b8', gold: '#f59e0b', platinum: '#0ea5e9', diamond: '#8b5cf6',
  };
  const lc = leagueColors[user.league] || '#7c3aed';

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.profileRow}>
          <Image
            source={{ uri: user.avatarUrl || `https://api.dicebear.com/8.x/personas/svg?seed=${user.username}` }}
            style={s.avatar}
          />
          <View style={{ flex: 1 }}>
            <Text style={s.username}>{user.username}</Text>
            <Text style={[s.league, { color: lc }]}>{user.league?.toUpperCase()}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
            <Text style={s.logoutText}>Ieșire</Text>
          </TouchableOpacity>
        </View>
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statVal}>{user.rating}</Text>
            <Text style={s.statLbl}>ELO Rating</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statVal, { color: '#f59e0b' }]}>{user.xp}</Text>
            <Text style={s.statLbl}>Total XP</Text>
          </View>
        </View>
      </View>

      {/* Play card */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>Selectează jocul</Text>
        <View style={s.pillRow}>
          {GAMES.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={[s.pill, selectedGame === g.id && s.pillActive]}
              onPress={() => setSelectedGame(g.id)}
            >
              <Text style={[s.pillText, selectedGame === g.id && s.pillTextActive]}>
                {g.emoji} {g.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.sectionTitle, { marginTop: 16 }]}>Nivel</Text>
        <View style={s.pillRow}>
          {LEVELS.map((l) => (
            <TouchableOpacity
              key={l}
              style={[s.pill, selectedLevel === l && s.pillActive]}
              onPress={() => setSelectedLevel(l)}
            >
              <Text style={[s.pillText, selectedLevel === l && s.pillTextActive]}>
                N{l} · {MAX_PLAYERS_PER_LEVEL[l]}⚔️
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={s.playBtn} onPress={handlePlay} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.playBtnText}>▶  Joacă acum</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Quick links */}
      <View style={s.quickRow}>
        <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/leaderboard')}>
          <Text style={s.quickEmoji}>🏆</Text>
          <Text style={s.quickLabel}>Clasament</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/profile')}>
          <Text style={s.quickEmoji}>📊</Text>
          <Text style={s.quickLabel}>Profil</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { backgroundColor: '#7c3aed', padding: 24, paddingTop: 56 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: '#fff' },
  username: { fontSize: 18, fontWeight: '800', color: '#fff' },
  league: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
  logoutText: { color: '#fff', fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 16 },
  statBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '800', color: '#fff' },
  statLbl: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  card: { margin: 16, backgroundColor: '#fafafa', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  pillActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  pillTextActive: { color: '#fff' },
  playBtn: { backgroundColor: '#7c3aed', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 20 },
  playBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  quickRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16 },
  quickBtn: { flex: 1, backgroundColor: '#fafafa', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', padding: 20, alignItems: 'center', gap: 6 },
  quickEmoji: { fontSize: 28 },
  quickLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
});

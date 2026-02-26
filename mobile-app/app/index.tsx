import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { leaderboardApi } from '../src/lib/api';
import { LeaderboardEntry } from '@integrame/shared';

export default function IndexScreen() {
  const router = useRouter();
  const [top, setTop] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    leaderboardApi.get({ page: 1 }).then((r) => setTop(r.data.slice(0, 5))).catch(() => {});
  }, []);

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <Text style={s.badge}>⚡ Multiplayer în timp real</Text>
        <Text style={s.title}>Integrame{'\n'}Competitive</Text>
        <Text style={s.subtitle}>
          Joacă integrame, slogane și alte jocuri de cuvinte în dueluri 1–20 jucători.
        </Text>
        <TouchableOpacity style={s.btnPrimary} onPress={() => router.push('/register')}>
          <Text style={s.btnPrimaryText}>Începe gratuit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnOutline} onPress={() => router.push('/login')}>
          <Text style={s.btnOutlineText}>Autentificare</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={s.stats}>
        {[
          { label: 'Jucători activi', value: '10K+' },
          { label: 'Meciuri azi', value: '5K+' },
          { label: 'Jocuri', value: '2+' },
        ].map((s2) => (
          <View key={s2.label} style={s.statItem}>
            <Text style={s.statValue}>{s2.value}</Text>
            <Text style={s.statLabel}>{s2.label}</Text>
          </View>
        ))}
      </View>

      {/* Top players */}
      {top.length > 0 && (
        <View style={s.topCard}>
          <Text style={s.topTitle}>🏆 Top jucători</Text>
          {top.map((p, idx) => (
            <View key={p.userId} style={s.topRow}>
              <Text style={s.topRank}>#{p.rank}</Text>
              <Image
                source={{ uri: `https://api.dicebear.com/8.x/bottts/svg?seed=${p.username}` }}
                style={s.avatar}
              />
              <Text style={s.topName}>{p.username}</Text>
              <Text style={s.topRating}>{p.rating}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  hero: { alignItems: 'center', gap: 16, marginBottom: 32 },
  badge: { backgroundColor: '#f5f3ff', color: '#7c3aed', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, fontSize: 13, fontWeight: '600', overflow: 'hidden' },
  title: { fontSize: 42, fontWeight: '900', textAlign: 'center', color: '#1a1a2e', lineHeight: 48 },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  btnPrimary: { backgroundColor: '#7c3aed', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 14, width: '100%', alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnOutline: { borderWidth: 2, borderColor: '#e5e7eb', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 14, width: '100%', alignItems: 'center' },
  btnOutlineText: { color: '#374151', fontSize: 16, fontWeight: '600' },
  stats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 32 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#7c3aed' },
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  topCard: { backgroundColor: '#fafafa', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', padding: 16 },
  topTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  topRank: { width: 24, fontSize: 12, color: '#9ca3af', fontFamily: 'monospace' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  topName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1f2937' },
  topRating: { fontSize: 14, fontWeight: '700', color: '#7c3aed' },
});

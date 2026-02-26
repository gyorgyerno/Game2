import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { matchesApi, invitesApi } from '../../src/lib/api';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function ResultScreen() {
  const router = useRouter();
  const { matchId, gameType } = useLocalSearchParams<{ matchId: string; gameType?: string }>();
  const [match, setMatch] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    matchesApi.getMatch(matchId).then((r) => setMatch(r.data)).catch(() => {});
    SecureStore.getItemAsync('user').then((u) => {
      if (u) setMyUserId(JSON.parse(u).id);
    });
  }, [matchId]);

  async function handleShare() {
    try {
      const { data } = await invitesApi.create({
        gameType: (gameType as string) || 'integrame',
        level: match?.level || 1,
        matchId,
      });
      const url = `${process.env.EXPO_PUBLIC_APP_URL || 'https://integrame.ro'}/invite/${data.code}`;
      await Share.share({ message: `Hai să jucăm Integrame! 🎯 ${url}`, url });
    } catch { /* noop */ }
  }

  if (!match) return (
    <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#7c3aed', fontSize: 16 }}>Se încarcă rezultatele...</Text>
    </View>
  );

  const sorted = [...(match.players || [])].sort((a: any, b: any) => b.score - a.score);
  const myResult = sorted.find((p: any) => p.userId === myUserId);
  const myPos = sorted.indexOf(myResult) + 1;

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* My result hero */}
      <View style={s.hero}>
        <Text style={s.medal}>{MEDALS[myPos - 1] || `#${myPos}`}</Text>
        <Text style={s.position}>Locul {myPos}</Text>
        {myResult && (
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statVal}>{myResult.score}</Text>
              <Text style={s.statLbl}>puncte</Text>
            </View>
            <View style={s.statBox}>
              <Text style={[s.statVal, { color: '#f59e0b' }]}>+{myResult.xpGained}</Text>
              <Text style={s.statLbl}>XP</Text>
            </View>
            <View style={s.statBox}>
              <Text style={[s.statVal, { color: myResult.eloChange >= 0 ? '#22c55e' : '#ef4444' }]}>
                {myResult.eloChange >= 0 ? '+' : ''}{myResult.eloChange}
              </Text>
              <Text style={s.statLbl}>ELO</Text>
            </View>
          </View>
        )}
      </View>

      {/* Rankings */}
      <View style={s.card}>
        <Text style={s.cardTitle}>🏆 Clasament final</Text>
        {sorted.map((p: any, idx: number) => (
          <View key={p.userId} style={[s.row, p.userId === myUserId && s.rowMe]}>
            <Text style={s.rowMedal}>{MEDALS[idx] || `#${idx + 1}`}</Text>
            <Image
              source={{ uri: p.user?.avatarUrl || `https://api.dicebear.com/8.x/personas/svg?seed=${p.user?.username}` }}
              style={s.avatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.rowName}>
                {p.user?.username || 'Player'}
                {p.userId === myUserId ? ' (tu)' : ''}
              </Text>
              <Text style={s.rowSub}>{p.correctAnswers} corecte · {p.mistakes} greșeli</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.rowScore}>{p.score} pts</Text>
              <Text style={s.rowXp}>+{p.xpGained} XP</Text>
            </View>
          </View>
        ))}
      </View>

      {/* CTAs */}
      <View style={s.ctaRow}>
        <TouchableOpacity
          style={s.btnPrimary}
          onPress={() => router.replace('/dashboard')}
        >
          <Text style={s.btnPrimaryText}>▶  Joacă din nou</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecondary} onPress={handleShare}>
          <Text style={s.btnSecondaryText}>👥  Invită prieteni</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const HERO_COLORS: Record<number, string> = { 1: '#7c3aed', 2: '#475569', 3: '#92400e' };

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  hero: { backgroundColor: '#7c3aed', paddingTop: 52, paddingBottom: 28, alignItems: 'center', gap: 6 },
  medal: { fontSize: 56 },
  position: { fontSize: 28, fontWeight: '900', color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 24, marginTop: 12 },
  statBox: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  statVal: { fontSize: 22, fontWeight: '800', color: '#fff' },
  statLbl: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  card: { margin: 16, backgroundColor: '#fafafa', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' },
  cardTitle: { padding: 14, fontSize: 15, fontWeight: '700', color: '#374151', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowMe: { backgroundColor: '#f5f3ff' },
  rowMedal: { fontSize: 20, width: 28, textAlign: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  rowName: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  rowSub: { fontSize: 11, color: '#9ca3af' },
  rowScore: { fontSize: 15, fontWeight: '800', color: '#7c3aed' },
  rowXp: { fontSize: 11, color: '#f59e0b' },
  ctaRow: { marginHorizontal: 16, gap: 10 },
  btnPrimary: { backgroundColor: '#7c3aed', borderRadius: 14, padding: 15, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: { backgroundColor: '#f3f4f6', borderRadius: 14, padding: 15, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  btnSecondaryText: { color: '#374151', fontSize: 16, fontWeight: '600' },
});

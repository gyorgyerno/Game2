import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image, ActivityIndicator,
} from 'react-native';
import { leaderboardApi } from '../src/lib/api';
import { LeaderboardEntry, GameLevel, MAX_PLAYERS_PER_LEVEL } from '@integrame/shared';

const GAMES = ['integrame', 'slogane'];
const LEVELS: GameLevel[] = [1, 2, 3, 4, 5];
const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardScreen() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [game, setGame] = useState('integrame');
  const [level, setLevel] = useState<GameLevel>(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    leaderboardApi.get({ gameType: game, level, page })
      .then((r) => setEntries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [game, level, page]);

  return (
    <View style={s.root}>
      {/* Game filter */}
      <View style={s.filterRow}>
        {GAMES.map((g) => (
          <TouchableOpacity
            key={g} style={[s.pill, game === g && s.pillActive]}
            onPress={() => { setGame(g); setPage(1); }}
          >
            <Text style={[s.pillText, game === g && s.pillTextActive]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Level filter */}
      <View style={s.filterRow}>
        {LEVELS.map((l) => (
          <TouchableOpacity
            key={l} style={[s.pill, level === l && s.pillActive]}
            onPress={() => { setLevel(l); setPage(1); }}
          >
            <Text style={[s.pillText, level === l && s.pillTextActive]}>
              N{l} · {MAX_PLAYERS_PER_LEVEL[l]}⚔️
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color="#7c3aed" size="large" />
        : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={{ paddingBottom: 30 }}
            ListEmptyComponent={
              <Text style={s.empty}>Niciun jucător încă. Fii primul! 🏆</Text>
            }
            renderItem={({ item, index }) => (
              <View style={s.row}>
                <Text style={s.rank}>{index < 3 ? MEDALS[index] : `#${item.rank}`}</Text>
                <Image
                  source={{ uri: item.avatarUrl || `https://api.dicebear.com/8.x/personas/svg?seed=${item.username}` }}
                  style={s.avatar}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item.username}</Text>
                  <Text style={s.league}>{item.league}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.rating}>{item.rating}</Text>
                  <Text style={s.wins}>{item.wins}W · {item.winRate}%</Text>
                </View>
              </View>
            )}
          />
        )}

      {/* Pagination */}
      <View style={s.paginationRow}>
        <TouchableOpacity
          style={[s.pageBtn, page === 1 && s.pageBtnDisabled]}
          onPress={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          <Text style={s.pageBtnText}>← Înapoi</Text>
        </TouchableOpacity>
        <Text style={s.pageNum}>Pag. {page}</Text>
        <TouchableOpacity
          style={[s.pageBtn, entries.length < 20 && s.pageBtnDisabled]}
          onPress={() => setPage((p) => p + 1)}
          disabled={entries.length < 20}
        >
          <Text style={s.pageBtnText}>Înainte →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  pillActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  pillTextActive: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  rank: { fontSize: 18, width: 32, textAlign: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  name: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  league: { fontSize: 11, color: '#7c3aed', fontWeight: '600' },
  rating: { fontSize: 16, fontWeight: '800', color: '#7c3aed' },
  wins: { fontSize: 11, color: '#9ca3af' },
  empty: { textAlign: 'center', marginTop: 48, color: '#9ca3af', fontSize: 15 },
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  pageBtn: { backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  pageNum: { fontSize: 13, color: '#6b7280' },
});

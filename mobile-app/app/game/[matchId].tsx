import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, Alert, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { matchesApi } from '../../src/lib/api';
import {
  SOCKET_EVENTS, GAME_RULES, Match, MatchPlayer, GameLevel, MAX_PLAYERS_PER_LEVEL,
} from '@integrame/shared';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
const { width: SCREEN_W } = Dimensions.get('window');

// Sample puzzle words for the crossword
const PUZZLE_WORDS = [
  { id: 0, word: 'ALPINIST', clue: 'Sportiv care urcă în vârf de munte' },
  { id: 1, word: 'AVION', clue: 'Mijloc de transport aerian' },
  { id: 2, word: 'LALEA', clue: 'Floare de primăvară' },
  { id: 3, word: 'PIN', clue: 'Arbore rășinos' },
];

function shuffleLetters(word: string): string[] {
  const arr = word.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function GamePlayScreen() {
  const router = useRouter();
  const { matchId, gameType = 'integrame' } = useLocalSearchParams<{ matchId: string; gameType?: string }>();
  const socketRef = useRef<Socket | null>(null);

  const [match, setMatch] = useState<Match | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [wordIdx, setWordIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [usedTiles, setUsedTiles] = useState<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rules = GAME_RULES[gameType as string] || GAME_RULES['integrame'];
  const word = PUZZLE_WORDS[wordIdx % PUZZLE_WORDS.length];
  const tiles = shuffleLetters(word.word);
  const level = (match?.level as GameLevel) || 1;

  useEffect(() => {
    async function init() {
      const token = await SecureStore.getItemAsync('token');
      if (!token) { router.replace('/login'); return; }

      const socket = io(API_URL, {
        auth: { token },
        transports: ['websocket'],
      });
      socketRef.current = socket;

      socket.emit(SOCKET_EVENTS.JOIN_MATCH, { matchId });

      socket.on(SOCKET_EVENTS.MATCH_STATE, (m: Match) => setMatch(m));
      socket.on(SOCKET_EVENTS.MATCH_COUNTDOWN, ({ countdown: c }: { countdown: number }) => setCountdown(c));
      socket.on(SOCKET_EVENTS.MATCH_START, () => {
        setCountdown(null);
        setStarted(true);
        setTimeLeft(rules.timeLimit);
      });
      socket.on(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE, (data: { players: MatchPlayer[] }) => {
        setMatch((prev) => prev ? { ...prev, players: data.players } : prev);
      });
      socket.on(SOCKET_EVENTS.MATCH_FINISHED, (final: Match) => {
        setFinished(true);
        if (timerRef.current) clearInterval(timerRef.current);
        router.push(`/result/${matchId}?gameType=${gameType}`);
      });

      // Fallback - load from API
      matchesApi.getMatch(matchId).then((r) => setMatch(r.data)).catch(() => {});
    }
    init();
    return () => {
      socketRef.current?.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [matchId]);

  useEffect(() => {
    if (!started || finished) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          socketRef.current?.emit(SOCKET_EVENTS.PLAYER_FINISH, { matchId, correctAnswers: correct, mistakes });
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [started, finished]);

  function handleTile(letter: string, idx: number) {
    if (usedTiles.includes(idx) || !started || finished) return;
    setUsedTiles((u) => [...u, idx]);
    // Check if correct (simplified: just count)
    if (letter.toLowerCase() === word.word[usedTiles.length]?.toLowerCase()) {
      if (usedTiles.length + 1 === word.word.length) {
        // Word complete
        const newCorrect = correct + 1;
        setCorrect(newCorrect);
        setUsedTiles([]);
        setWordIdx((w) => w + 1);
        socketRef.current?.emit(SOCKET_EVENTS.PLAYER_PROGRESS, {
          matchId, correctAnswers: newCorrect, mistakes,
        });
      }
    } else {
      setMistakes((m) => m + 1);
      setTimeout(() => setUsedTiles([]), 400);
    }
  }

  function handleFinish() {
    if (finished) return;
    setFinished(true);
    if (timerRef.current) clearInterval(timerRef.current);
    socketRef.current?.emit(SOCKET_EVENTS.PLAYER_FINISH, { matchId, correctAnswers: correct, mistakes });
  }

  const sortedPlayers = match?.players ? [...match.players].sort((a: any, b: any) => b.score - a.score) : [];
  const min = Math.floor(timeLeft / 60);
  const sec = String(timeLeft % 60).padStart(2, '0');
  const timerUrgent = timeLeft <= 30;

  return (
    <View style={s.root}>
      {/* Countdown overlay */}
      {countdown !== null && (
        <View style={s.countdown}>
          <Text style={s.countdownNum}>{countdown === 0 ? '🚀' : countdown}</Text>
          <Text style={s.countdownLabel}>{countdown === 0 ? 'Start!' : 'Pregătește-te!'}</Text>
        </View>
      )}

      {/* Header */}
      <View style={s.header}>
        <Text style={s.gameName}>{(gameType as string).charAt(0).toUpperCase() + (gameType as string).slice(1)}</Text>
        {started && !finished && (
          <Text style={[s.timer, timerUrgent && s.timerUrgent]}>
            ⏱ {min > 0 ? `${min}:${sec}` : `${timeLeft}s`}
          </Text>
        )}
        {match?.status === 'waiting' && (
          <Text style={s.waiting}>Așteptăm jucători... {match.players.length}/{MAX_PLAYERS_PER_LEVEL[level]}</Text>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Players row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.playersScroll} contentContainerStyle={s.playersRow}>
          {sortedPlayers.map((p: any, idx: number) => (
            <View key={p.userId} style={[s.playerCard, idx === 0 && started && s.playerCardFirst]}>
              <Image
                source={{ uri: p.user?.avatarUrl || `https://api.dicebear.com/8.x/personas/svg?seed=${p.user?.username}` }}
                style={s.playerAvatar}
              />
              <Text style={s.playerName} numberOfLines={1}>{p.user?.username || 'Player'}</Text>
              <Text style={s.playerScore}>{p.score}</Text>
              {p.finishedAt && <Text style={s.playerDone}>✓</Text>}
            </View>
          ))}
        </ScrollView>

        {/* Clue */}
        <View style={s.clueBox}>
          <Text style={s.clue}>{word.clue}</Text>
          <Text style={s.clueLen}>{word.word.length} litere</Text>
        </View>

        {/* Letter input boxes */}
        <View style={s.inputRow}>
          {word.word.split('').map((_, idx) => {
            const filled = usedTiles.length > idx;
            return (
              <View key={idx} style={[s.inputCell, filled && s.inputCellFilled]}>
                <Text style={s.inputCellText}>{filled ? tiles[usedTiles[idx]] || '?' : ''}</Text>
              </View>
            );
          })}
        </View>

        {/* Letter tiles */}
        {started && !finished && (
          <View style={s.tilesWrap}>
            {tiles.map((l, idx) => (
              <TouchableOpacity
                key={idx}
                style={[s.tile, usedTiles.includes(idx) && s.tileUsed]}
                onPress={() => handleTile(l, idx)}
                activeOpacity={0.7}
              >
                <Text style={s.tileLetter}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Score row */}
        {started && (
          <View style={s.scoreRow}>
            <View style={s.scoreItem}>
              <Text style={s.scoreVal}>✅ {correct}</Text>
              <Text style={s.scoreLbl}>Corecte</Text>
            </View>
            <View style={s.scoreItem}>
              <Text style={s.scoreVal}>❌ {mistakes}</Text>
              <Text style={s.scoreLbl}>Greșeli</Text>
            </View>
            <View style={s.scoreItem}>
              <Text style={[s.scoreVal, { color: '#7c3aed' }]}>
                {correct * rules.pointsPerCorrect + mistakes * rules.pointsPerMistake}
              </Text>
              <Text style={s.scoreLbl}>Puncte</Text>
            </View>
          </View>
        )}

        {/* Finish button */}
        {started && !finished && (
          <TouchableOpacity style={s.finishBtn} onPress={handleFinish}>
            <Text style={s.finishBtnText}>🏁 Am terminat!</Text>
          </TouchableOpacity>
        )}

        {finished && (
          <View style={s.doneBox}>
            <Text style={s.doneText}>✅ Ai terminat! Se calculează rezultatele...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  countdown: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.95)', zIndex: 99, alignItems: 'center', justifyContent: 'center' },
  countdownNum: { fontSize: 120, fontWeight: '900', color: '#7c3aed' },
  countdownLabel: { fontSize: 18, color: '#6b7280', marginTop: 8 },
  header: { backgroundColor: '#7c3aed', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 20, alignItems: 'center', gap: 4 },
  gameName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  timer: { color: 'rgba(255,255,255,0.9)', fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timerUrgent: { color: '#fca5a5' },
  waiting: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  playersScroll: { maxHeight: 110 },
  playersRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  playerCard: { alignItems: 'center', width: 60, backgroundColor: '#fafafa', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: '#f3f4f6' },
  playerCardFirst: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  playerAvatar: { width: 36, height: 36, borderRadius: 18 },
  playerName: { fontSize: 10, fontWeight: '600', color: '#374151', marginTop: 4, maxWidth: 56, textAlign: 'center' },
  playerScore: { fontSize: 14, fontWeight: '800', color: '#7c3aed', marginTop: 2 },
  playerDone: { fontSize: 12, color: '#22c55e' },
  clueBox: { paddingHorizontal: 24, paddingVertical: 16, alignItems: 'center' },
  clue: { fontSize: 18, fontWeight: '700', color: '#1f2937', textAlign: 'center', lineHeight: 26 },
  clueLen: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  inputRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingHorizontal: 20, marginBottom: 20, flexWrap: 'wrap' },
  inputCell: { width: 40, height: 40, borderWidth: 2, borderColor: '#1a1a2e', borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ede9fe' },
  inputCellFilled: { backgroundColor: '#c4b5fd', borderColor: '#7c3aed' },
  inputCellText: { fontSize: 18, fontWeight: '800', color: '#1a1a2e' },
  tilesWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  tile: { width: 50, height: 50, backgroundColor: '#7c3aed', borderRadius: 10, alignItems: 'center', justifyContent: 'center', shadowColor: '#5b21b6', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
  tileUsed: { opacity: 0.25, shadowOpacity: 0, elevation: 0 },
  tileLetter: { color: '#fff', fontSize: 20, fontWeight: '800' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 20, marginTop: 20, marginBottom: 8 },
  scoreItem: { alignItems: 'center', gap: 2 },
  scoreVal: { fontSize: 18, fontWeight: '800', color: '#1f2937' },
  scoreLbl: { fontSize: 11, color: '#9ca3af' },
  finishBtn: { margin: 20, backgroundColor: '#f3f4f6', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  finishBtnText: { fontSize: 16, fontWeight: '700', color: '#374151' },
  doneBox: { margin: 20, backgroundColor: '#f0fdf4', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#bbf7d0' },
  doneText: { color: '#16a34a', fontWeight: '600', textAlign: 'center' },
});

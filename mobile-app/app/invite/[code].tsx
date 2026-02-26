import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { invitesApi } from '../../src/lib/api';

export default function InviteScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [invite, setInvite] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    invitesApi.get(code)
      .then((r) => setInvite(r.data))
      .catch((e) => setError(e.response?.data?.error || 'Invitație invalidă'))
      .finally(() => setLoading(false));
  }, [code]);

  async function handleAccept() {
    const token = await SecureStore.getItemAsync('token');
    if (!token) {
      router.push(`/register?ref=${code}`);
      return;
    }
    setAccepting(true);
    try {
      const { data } = await invitesApi.accept(code);
      // data.redirectTo e.g. /games/integrame/play?matchId=xxx
      const parts = data.redirectTo.split('/');
      const gameType = parts[2];
      const searchStr = data.redirectTo.split('?')[1] || '';
      const params = Object.fromEntries(new URLSearchParams(searchStr));
      if (params.matchId) {
        router.replace(`/game/${params.matchId}?gameType=${gameType}`);
      } else {
        router.replace('/dashboard');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || 'Eroare la acceptare');
    } finally { setAccepting(false); }
  }

  if (loading) return (
    <View style={s.center}>
      <ActivityIndicator color="#7c3aed" size="large" />
    </View>
  );

  return (
    <View style={s.root}>
      <View style={s.card}>
        {error ? (
          <>
            <Text style={s.emoji}>😕</Text>
            <Text style={s.title}>Invitație invalidă</Text>
            <Text style={s.subtitle}>{error}</Text>
            <TouchableOpacity style={s.btn} onPress={() => router.replace('/')}>
              <Text style={s.btnText}>Înapoi acasă</Text>
            </TouchableOpacity>
          </>
        ) : invite ? (
          <>
            <View style={s.iconWrap}>
              <Text style={{ fontSize: 36 }}>👥</Text>
            </View>
            <Text style={s.title}>Ai fost invitat!</Text>
            <Text style={s.subtitle}>
              <Text style={s.bold}>{invite.creator?.username}</Text> te invită la un duel de{' '}
              <Text style={[s.bold, { color: '#7c3aed' }]}>{invite.gameType}</Text>
            </Text>

            <View style={s.infoRow}>
              <View style={s.infoBox}>
                <Text style={s.infoVal}>Nivel {invite.level}</Text>
                <Text style={s.infoLbl}>nivel joc</Text>
              </View>
              <View style={s.infoBox}>
                <Text style={s.infoVal}>{invite.usedBy?.length || 0}/{invite.maxUses}</Text>
                <Text style={s.infoLbl}>locuri ocupate</Text>
              </View>
            </View>

            <TouchableOpacity style={s.btn} onPress={handleAccept} disabled={accepting}>
              {accepting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>✅  Acceptă și intră în joc</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={s.btnSecondary} onPress={() => router.replace('/register?ref=' + code)}>
              <Text style={s.btnSecondaryText}>Nu am cont – Înregistrează-mă</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', padding: 24 },
  center: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fafafa', borderRadius: 24, borderWidth: 1, borderColor: '#f3f4f6', padding: 28, alignItems: 'center', gap: 14 },
  emoji: { fontSize: 56 },
  iconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#1a1a2e', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
  bold: { fontWeight: '700', color: '#1f2937' },
  infoRow: { flexDirection: 'row', gap: 16 },
  infoBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, alignItems: 'center' },
  infoVal: { fontSize: 18, fontWeight: '800', color: '#7c3aed' },
  infoLbl: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  btn: { backgroundColor: '#7c3aed', borderRadius: 14, padding: 15, alignItems: 'center', width: '100%' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: { padding: 10 },
  btnSecondaryText: { color: '#7c3aed', fontSize: 13, fontWeight: '600' },
});

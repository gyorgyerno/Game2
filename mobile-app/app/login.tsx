import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '../src/lib/api';

type Step = 'email' | 'otp';

export default function LoginScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSendOtp() {
    if (!email) return;
    setLoading(true);
    try {
      await authApi.sendOtp(email);
      setStep('otp');
    } catch (e: any) {
      Alert.alert('Eroare', e.response?.data?.error || 'Nu s-a putut trimite OTP');
    } finally { setLoading(false); }
  }

  async function handleLogin() {
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      const { data } = await authApi.login(email, otp);
      await SecureStore.setItemAsync('token', data.token);
      await SecureStore.setItemAsync('user', JSON.stringify(data.user));
      router.replace('/dashboard');
    } catch (e: any) {
      Alert.alert('Eroare', e.response?.data?.error || 'OTP invalid sau expirat');
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.root}>
      <View style={s.card}>
        <Text style={s.title}>Bun venit înapoi</Text>
        <Text style={s.subtitle}>Email + cod OTP 6 cifre</Text>

        {step === 'email' ? (
          <>
            <TextInput
              style={s.input}
              placeholder="tu@exemplu.ro"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <TouchableOpacity style={s.btn} onPress={handleSendOtp} disabled={loading || !email}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Trimite cod OTP →</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.hint}>Cod trimis la <Text style={s.hintBold}>{email}</Text></Text>
            <TextInput
              style={[s.input, s.otpInput]}
              placeholder="123456"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
            />
            <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading || otp.length !== 6}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Autentificare</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStep('email'); setOtp(''); }}>
              <Text style={s.link}>← Schimbă emailul</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.push('/register')}>
          <Text style={s.link}>Nu ai cont? <Text style={s.linkBold}>Înregistrează-te</Text></Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', padding: 24 },
  card: { gap: 14 },
  title: { fontSize: 26, fontWeight: '800', color: '#1a1a2e' },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 16, color: '#1f2937', backgroundColor: '#fafafa' },
  otpInput: { textAlign: 'center', fontSize: 28, fontWeight: '700', letterSpacing: 12 },
  btn: { backgroundColor: '#7c3aed', borderRadius: 12, padding: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, color: '#6b7280', textAlign: 'center' },
  hintBold: { fontWeight: '700', color: '#1f2937' },
  link: { color: '#6b7280', textAlign: 'center', fontSize: 14, marginTop: 4 },
  linkBold: { color: '#7c3aed', fontWeight: '700' },
});

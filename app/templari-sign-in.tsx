import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTemplariId } from '@templari/identity'
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme'
import { TEMPLARI_ID_ENABLED, requestMagicLinkSafe } from '../lib/templariId'
import { log } from '../lib/log'

// Native completes the magic link via the app's deep-link scheme. The central
// project's auth config must allowlist this redirect URL.
const REDIRECT_TO = 'palmreader://auth/callback'

export default function TemplariSignInScreen() {
  const { tid, isAuthenticated } = useTemplariId()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (isAuthenticated && tid) {
      const timer = setTimeout(() => router.back(), 600)
      return () => clearTimeout(timer)
    }
  }, [isAuthenticated, tid])

  const submit = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed.includes('@')) {
      Alert.alert('Invalid email', 'Enter the email you want to use across Templari.')
      return
    }
    if (!TEMPLARI_ID_ENABLED) {
      Alert.alert('Templari ID disabled', 'This build has cross-app identity turned off.')
      return
    }
    setSending(true)
    try {
      await requestMagicLinkSafe(trimmed, { redirectTo: REDIRECT_TO })
      setSent(true)
    } catch (err) {
      log.warn('[templari-id][palm][sign-in] requestMagicLink failed:', err)
      Alert.alert('Could not send link', err instanceof Error ? err.message : 'Try again shortly.')
    } finally {
      setSending(false)
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.glyph}>✦</Text>
        <Text style={styles.title}>Sign in to Templari</Text>
        <Text style={styles.subtitle}>
          One account across Palm Reader and the rest of the Templari suite — so your
          subscription follows you to every device.
        </Text>

        {isAuthenticated ? (
          <Text style={styles.card}>Signed in. Returning…</Text>
        ) : sent ? (
          <Text style={styles.card}>
            Check {email}. Tap the magic link; it will open Palm Reader automatically.
          </Text>
        ) : (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TouchableOpacity style={styles.cta} onPress={submit} disabled={sending} activeOpacity={0.85}>
              {sending ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.ctaText}>Send Magic Link</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, flexGrow: 1 },
  glyph: { color: Colors.primary, fontSize: 42, textAlign: 'center', marginBottom: Spacing.md },
  title: { ...Typography.h1, color: Colors.text, textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { ...Typography.bodySmall, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.xl },
  label: { ...Typography.label, color: Colors.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: Spacing.sm },
  input: { ...Typography.body, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, color: Colors.text, padding: Spacing.md, marginBottom: Spacing.md },
  cta: { backgroundColor: Colors.primary, borderRadius: BorderRadius.full, padding: Spacing.md, alignItems: 'center' },
  ctaText: { ...Typography.h3, color: Colors.bg, fontWeight: '700' },
  card: { ...Typography.body, color: Colors.text, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, lineHeight: 22 },
  back: { alignSelf: 'center', marginTop: Spacing.xl, padding: Spacing.sm },
  backText: { ...Typography.body, color: Colors.textMuted },
})

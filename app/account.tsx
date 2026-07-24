import { useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTemplariId } from '@templari/identity'
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme'
import { TEMPLARI_ID_ENABLED, signOutTemplariSafe } from '../lib/templariId'
import { log } from '../lib/log'

export default function AccountScreen() {
  const { tid, isAuthenticated } = useTemplariId()
  const [signingOut, setSigningOut] = useState(false)

  const doSignOut = async () => {
    setSigningOut(true)
    try {
      await signOutTemplariSafe()
    } catch (err) {
      log.warn('[templari-id][palm][account] signOut failed:', err)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.glyph}>✦</Text>
        <Text style={styles.title}>Account</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Templari ID</Text>
          {isAuthenticated && tid ? (
            <>
              <Text style={styles.cardBody}>
                Signed in. Your subscription is tied to your Templari ID and follows you to
                every Templari app and device.
              </Text>
              <Text style={styles.tid}>ID · {tid.slice(0, 8)}…</Text>
              <TouchableOpacity style={styles.secondary} onPress={doSignOut} disabled={signingOut} activeOpacity={0.85}>
                {signingOut ? <ActivityIndicator color={Colors.text} /> : <Text style={styles.secondaryText}>Sign out</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.cardBody}>
                Sign in to sync your purchases across devices and the rest of the Templari
                suite. Without it, a purchase stays on this device only.
              </Text>
              <TouchableOpacity
                style={styles.cta}
                onPress={() => router.push('/templari-sign-in')}
                disabled={!TEMPLARI_ID_ENABLED}
                activeOpacity={0.85}
              >
                <Text style={styles.ctaText}>Sign in to sync</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

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
  glyph: { color: Colors.primary, fontSize: 38, textAlign: 'center', marginTop: Spacing.md, marginBottom: Spacing.sm },
  title: { ...Typography.h1, color: Colors.text, textAlign: 'center', marginBottom: Spacing.xl },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  cardLabel: { ...Typography.label, color: Colors.primary, letterSpacing: 1, textTransform: 'uppercase' },
  cardBody: { ...Typography.body, color: Colors.textMuted, lineHeight: 22 },
  tid: { ...Typography.bodySmall, color: Colors.textMuted, fontFamily: undefined },
  cta: { backgroundColor: Colors.primary, borderRadius: BorderRadius.full, padding: Spacing.md, alignItems: 'center' },
  ctaText: { ...Typography.h3, color: Colors.bg, fontWeight: '700' },
  secondary: { backgroundColor: Colors.surfaceRaised, borderRadius: BorderRadius.full, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  secondaryText: { ...Typography.h3, color: Colors.text },
  back: { alignSelf: 'center', marginTop: Spacing.xl, padding: Spacing.sm },
  backText: { ...Typography.body, color: Colors.textMuted },
})

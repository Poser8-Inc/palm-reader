// Magic-link landing screen for Templari ID.
//
// Supabase's email magic link redirects to `palmreader://auth/callback` with
// the token hash as a query param. The actual token exchange happens in
// TemplariMount (which subscribes to all incoming URLs at the root layout);
// this screen exists only so Expo Router has a route to match instead of
// falling through to "Unmatched Route". Once useTemplariId() reports an
// authenticated session, we pop back.

import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useTemplariId } from '@templari/identity'
import { Colors, Spacing, Typography } from '../../constants/theme'

export default function AuthCallbackScreen() {
  const { isAuthenticated, tid } = useTemplariId()

  useEffect(() => {
    if (isAuthenticated && tid) {
      const timer = setTimeout(() => {
        if (router.canGoBack()) router.back()
        else router.replace('/account' as any)
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [isAuthenticated, tid])

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.text}>
        {isAuthenticated ? 'Signed in. Returning…' : 'Completing sign-in…'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  text: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
})

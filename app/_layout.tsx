import '../global.css'
import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Platform } from 'react-native'
import * as NavigationBar from 'expo-navigation-bar'
import { Colors } from '../constants/theme'
import Purchases, { LOG_LEVEL } from 'react-native-purchases'
import { log } from '../lib/log'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'

export default function RootLayout() {
  const setUserId = useStore((s) => s.setUserId)
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {})
      NavigationBar.setVisibilityAsync('hidden').catch(() => {})
    }
  }, [])

  useEffect(() => {
    // RC public SDK keys are safe to embed client-side per RevenueCat docs.
    // Fallback to hardcoded values so missing EXPO_PUBLIC_* env vars at build
    // time don't silently skip Purchases.configure (bug seen on preview builds).
    const apiKey = Platform.OS === 'ios'
      ? (process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || 'appl_WKGbFzWrqtRwohRcTqplSmOtKze')
      : (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || 'goog_xagpoHjxRBqEROMFASlwKdfbazn')
    if (apiKey) {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN)
      try {
        Purchases.configure({ apiKey })
      } catch (err) {
        log.warn('[rc][palm][configure] Purchases.configure failed:', err)
      }
    }
  }, [])

  useEffect(() => {
    // Bootstrap auth session — sign in anonymously if no session yet. Push
    // user.id into the store so downstream calls can identify the caller.
    // Without this, userId stays null forever and the reading screen's guard
    // blocks the analysis call with "Still setting up your account…".
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id)
      } else {
        supabase.auth.signInAnonymously().catch((err) => {
          log.warn('[palm][auth] signInAnonymously failed:', err)
        })
      }
    })

    // After signInAnonymously resolves, the auth state listener fires with the
    // new session — that's where the userId actually lands in the store on
    // first launch.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id)
      } else {
        setUserId(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [setUserId])

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={Colors.bg} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.bg },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="capture" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="reading" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="history" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="paywall" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

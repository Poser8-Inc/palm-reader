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

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {})
      NavigationBar.setVisibilityAsync('hidden').catch(() => {})
    }
  }, [])

  useEffect(() => {
    const apiKey = Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? ''
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? ''
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        supabase.auth.signInAnonymously().catch((err) => {
          log.warn('[palm][auth] signInAnonymously failed:', err)
        })
      }
    })
  }, [])

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

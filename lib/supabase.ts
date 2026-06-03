import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { log } from './log'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

export async function getAccessToken(): Promise<string> {
  const existing = await supabase.auth.getSession()
  if (existing.data.session) return existing.data.session.access_token
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error || !data.session) {
    throw new Error('Authentication required to call the oracle.')
  }
  return data.session.access_token
}

// Database types
export interface Reading {
  id: string
  user_id: string
  image_url: string | null
  image_thumbnail: string | null // base64 thumbnail for local display
  created_at: string
  heart_line: string | null
  head_line: string | null
  life_line: string | null
  fate_line: string | null
  mounts: string | null
  overall: string | null
  raw_reading: string | null
}

export interface UserProfile {
  id: string
  email: string | null
  readings_used: number
  is_premium: boolean
  premium_expires_at: string | null
  created_at: string
}

// Helpers — STUBBED. Neither `profiles` nor `readings` exists in the
// Suite-shared Supabase project (jpwmfztcprbwkpbkyiqm); both return 404
// on every page load. Palm Reader is being retired into Soma's
// multi-modal Body Reading product per Phase B, but it's still on the
// App Store and Play Store as of 2026-06-03 — real users were getting
// background 404 noise. Stub the 4 helpers to safe defaults; the public
// API surface is preserved.
export async function getReadingsCount(_userId: string): Promise<number> {
  return 0
}

export async function getUserProfile(_userId: string): Promise<UserProfile | null> {
  return null
}

export async function getPastReadings(_userId: string, _limit = 20): Promise<Reading[]> {
  return []
}

export async function saveReading(_reading: Omit<Reading, 'id' | 'created_at'>): Promise<Reading | null> {
  return null
}

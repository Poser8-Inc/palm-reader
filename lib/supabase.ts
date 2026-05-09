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

// Helpers
export async function getReadingsCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('readings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) {
    log.error('[supabase] getReadingsCount error:', error.message)
    return 0
  }
  return count ?? 0
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    log.error('[supabase] getUserProfile error:', error.message)
    return null
  }
  return data
}

export async function getPastReadings(userId: string, limit = 20): Promise<Reading[]> {
  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    log.error('[supabase] getPastReadings error:', error.message)
    return []
  }
  return data ?? []
}

export async function saveReading(reading: Omit<Reading, 'id' | 'created_at'>): Promise<Reading | null> {
  const { data, error } = await supabase
    .from('readings')
    .insert(reading)
    .select()
    .single()

  if (error) {
    log.error('[supabase] saveReading error:', error.message)
    return null
  }
  return data
}

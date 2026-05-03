import { create } from 'zustand'
import type { Reading, UserProfile } from './supabase'

export interface ReadingSection {
  key: 'heart_line' | 'head_line' | 'life_line' | 'fate_line' | 'mounts' | 'overall'
  label: string
  emoji: string
  color: string
  content: string
  isStreaming: boolean
  isComplete: boolean
}

export interface AppState {
  // Auth
  userId: string | null
  profile: UserProfile | null
  setUserId: (id: string | null) => void
  setProfile: (profile: UserProfile | null) => void

  // Readings count (free tier gate)
  readingsRemaining: number
  setReadingsRemaining: (n: number) => void
  decrementReadings: () => void

  // Current capture
  capturedImageUri: string | null
  setCapturedImageUri: (uri: string | null) => void

  // Active reading
  activeReading: Reading | null
  readingSections: ReadingSection[]
  readingStatus: 'idle' | 'loading' | 'streaming' | 'complete' | 'error'
  readingError: string | null
  setActiveReading: (r: Reading | null) => void
  setReadingStatus: (s: AppState['readingStatus']) => void
  setReadingError: (e: string | null) => void
  updateSection: (key: ReadingSection['key'], partial: Partial<ReadingSection>) => void
  resetReading: () => void

  // History
  history: Reading[]
  setHistory: (readings: Reading[]) => void
  addToHistory: (reading: Reading) => void

  // Paywall
  paywallVisible: boolean
  setPaywallVisible: (v: boolean) => void
}

const FREE_READINGS_LIMIT = 2

const INITIAL_SECTIONS: ReadingSection[] = [
  { key: 'heart_line', label: 'Heart Line', emoji: '♥', color: '#8B2439', content: '', isStreaming: false, isComplete: false },
  { key: 'head_line', label: 'Head Line', emoji: '◈', color: '#D4A84B', content: '', isStreaming: false, isComplete: false },
  { key: 'life_line', label: 'Life Line', emoji: '✦', color: '#2D4A3E', content: '', isStreaming: false, isComplete: false },
  { key: 'fate_line', label: 'Fate Line', emoji: '★', color: '#6B4C8A', content: '', isStreaming: false, isComplete: false },
  { key: 'mounts', label: 'The Mounts', emoji: '◉', color: '#4A6B8A', content: '', isStreaming: false, isComplete: false },
  { key: 'overall', label: 'Overall Reading', emoji: '✧', color: '#D4A84B', content: '', isStreaming: false, isComplete: false },
]

export const useStore = create<AppState>((set, get) => ({
  // Auth
  userId: null,
  profile: null,
  setUserId: (id) => set({ userId: id }),
  setProfile: (profile) => set({ profile }),

  // Free tier
  readingsRemaining: FREE_READINGS_LIMIT,
  setReadingsRemaining: (n) => set({ readingsRemaining: n }),
  decrementReadings: () => set((s) => ({ readingsRemaining: Math.max(0, s.readingsRemaining - 1) })),

  // Capture
  capturedImageUri: null,
  setCapturedImageUri: (uri) => set({ capturedImageUri: uri }),

  // Active reading
  activeReading: null,
  readingSections: INITIAL_SECTIONS,
  readingStatus: 'idle',
  readingError: null,
  setActiveReading: (r) => set({ activeReading: r }),
  setReadingStatus: (s) => set({ readingStatus: s }),
  setReadingError: (e) => set({ readingError: e }),
  updateSection: (key, partial) =>
    set((state) => ({
      readingSections: state.readingSections.map((s) =>
        s.key === key ? { ...s, ...partial } : s
      ),
    })),
  resetReading: () =>
    set({
      activeReading: null,
      readingSections: INITIAL_SECTIONS.map((s) => ({ ...s })),
      readingStatus: 'idle',
      readingError: null,
      capturedImageUri: null,
    }),

  // History
  history: [],
  setHistory: (readings) => set({ history: readings }),
  addToHistory: (reading) =>
    set((state) => ({ history: [reading, ...state.history] })),

  // Paywall
  paywallVisible: false,
  setPaywallVisible: (v) => set({ paywallVisible: v }),
}))

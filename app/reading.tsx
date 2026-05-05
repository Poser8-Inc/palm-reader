import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Canvas, Path, Skia, Circle, Group, Paint } from '@shopify/react-native-skia'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  FadeIn,
  FadeInDown,
  SlideInRight,
  Easing,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme'
import { useStore, type ReadingSection } from '../lib/store'
import { readPalm, createThumbnail } from '../lib/palmReader'
import { saveReading } from '../lib/supabase'

const { width: W } = Dimensions.get('window')

// Animated mystical spiral loader using Skia
function MysticalLoader({ visible }: { visible: boolean }) {
  const rotation = useSharedValue(0)
  const pulse = useSharedValue(0.6)

  useEffect(() => {
    if (visible) {
      rotation.value = withRepeat(
        withTiming(Math.PI * 2, { duration: 3000, easing: Easing.linear }),
        -1
      )
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.5, { duration: 1200, easing: Easing.inOut(Easing.sin) })
        ),
        -1
      )
    }
  }, [visible])

  const SIZE = 160
  const cx = SIZE / 2
  const cy = SIZE / 2

  // Draw a spiral using arc segments
  const spiral = Skia.Path.Make()
  const numArms = 3
  const turns = 2.5
  for (let arm = 0; arm < numArms; arm++) {
    const startAngle = (arm / numArms) * Math.PI * 2
    for (let i = 0; i <= 60; i++) {
      const t = i / 60
      const angle = startAngle + t * Math.PI * 2 * turns
      const r = 10 + t * 55
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      if (i === 0) spiral.moveTo(x, y)
      else spiral.lineTo(x, y)
    }
  }

  // Gold particle dots
  const particles: { x: number; y: number; r: number; opacity: number }[] = []
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const r = 60 + Math.sin(i * 1.3) * 15
    particles.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      r: 2 + Math.sin(i * 0.7) * 1.5,
      opacity: 0.4 + Math.sin(i * 0.5) * 0.3,
    })
  }

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}rad` }],
    opacity: pulse.value,
  }))

  if (!visible) return null

  return (
    <Animated.View entering={FadeIn} style={styles.loaderWrapper}>
      <Animated.View style={containerStyle}>
        <Canvas style={{ width: SIZE, height: SIZE }}>
          <Path
            path={spiral}
            color={Colors.primary}
            style="stroke"
            strokeWidth={1.5}
            strokeCap="round"
            opacity={0.7}
          />
          {particles.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={p.r} color={Colors.primary} opacity={p.opacity} />
          ))}
          {/* Center glow */}
          <Circle cx={cx} cy={cy} r={8} color={Colors.primary} opacity={0.6} />
          <Circle cx={cx} cy={cy} r={4} color={Colors.text} opacity={0.9} />
        </Canvas>
      </Animated.View>
      <Text style={styles.loaderText}>Reading your palm...</Text>
      <Text style={styles.loaderSubtext}>Analyzing lines, mounts, and patterns</Text>
    </Animated.View>
  )
}

// Individual reading section card
function SectionCard({ section, index }: { section: ReadingSection; index: number }) {
  const hasContent = section.content.length > 0

  if (!hasContent && !section.isStreaming) return null

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      style={[styles.sectionCard, { borderLeftColor: section.color }]}
    >
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionEmoji]}>{section.emoji}</Text>
        <Text style={[styles.sectionLabel, { color: section.color }]}>{section.label}</Text>
        {section.isStreaming && !section.isComplete && (
          <View style={[styles.streamingDot, { backgroundColor: section.color }]} />
        )}
        {section.isComplete && (
          <Text style={[styles.completeMark, { color: section.color }]}>✓</Text>
        )}
      </View>
      <Text style={styles.sectionContent}>
        {section.content}
        {section.isStreaming && !section.isComplete && (
          <Text style={[styles.cursor, { color: section.color }]}>▌</Text>
        )}
      </Text>
    </Animated.View>
  )
}

export default function ReadingScreen() {
  const router = useRouter()
  const {
    capturedImageUri,
    readingSections,
    readingStatus,
    readingError,
    activeReading,
    userId,
    decrementReadings,
    addToHistory,
    resetReading,
    setReadingStatus,
    setReadingError,
    setActiveReading,
  } = useStore()

  const scrollRef = useRef<ScrollView>(null)
  const hasStarted = useRef(false)

  const completedSections = readingSections.filter((s) => s.isComplete)
  const isLoading = readingStatus === 'loading'
  const isStreaming = readingStatus === 'streaming'
  const isComplete = readingStatus === 'complete'
  const isError = readingStatus === 'error'

  useEffect(() => {
    if (!capturedImageUri) {
      router.replace('/')
      return
    }
    if (hasStarted.current) return
    hasStarted.current = true

    startReading()
  }, [capturedImageUri])

  // Scroll to bottom as sections stream in
  useEffect(() => {
    if (completedSections.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true })
      }, 200)
    }
  }, [completedSections.length])

  const startReading = async () => {
    if (!capturedImageUri) return

    try {
      const result = await readPalm(
        capturedImageUri,
        userId ?? 'anonymous',
      )

      // Haptic feedback when complete
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

      // Decrement free reading count
      decrementReadings()

      // PALM-029: don't persist anonymous readings — they would orphan in DB
      // (decision §3 in 01-DEFECT-QUEUE.md). Result screen still renders from in-memory state.
      if (userId) {
        try {
          const thumbnail = await createThumbnail(capturedImageUri)
          const saved = await saveReading({
            user_id: userId,
            image_url: null,
            image_thumbnail: thumbnail,
            heart_line: result.heart_line,
            head_line: result.head_line,
            life_line: result.life_line,
            fate_line: result.fate_line,
            mounts: result.mounts,
            overall: result.overall,
            raw_reading: result.raw,
          })
          if (saved) {
            setActiveReading(saved)
            addToHistory(saved)
          }
        } catch (saveErr) {
          // Non-fatal: reading still displayed even if save fails
          if (__DEV__) console.warn('[reading] Save failed:', saveErr)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reading failed'
      if (__DEV__) console.warn('[reading] Reading failed:', msg)
      setReadingError(msg)
      setReadingStatus('error')
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }

  const handleDone = () => {
    resetReading()
    router.replace('/')
  }

  const handleRetry = () => {
    hasStarted.current = false
    setReadingError(null)
    setReadingStatus('idle')
    startReading()
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleDone} style={styles.doneBtn}>
          <Text style={styles.doneBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Palm Reading</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Palm thumbnail */}
        {capturedImageUri && (
          <Animated.View entering={FadeIn} style={styles.thumbnailRow}>
            <Image
              source={{ uri: capturedImageUri }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
            <View style={styles.thumbnailMeta}>
              <Text style={styles.thumbnailTitle}>Your Palm</Text>
              <Text style={styles.thumbnailDate}>
                {new Date().toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              {isComplete && (
                <View style={styles.completeChip}>
                  <Text style={styles.completeChipText}>Reading Complete</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Mystical loader */}
        {(isLoading || (isStreaming && completedSections.length === 0)) && (
          <MysticalLoader visible={true} />
        )}

        {/* Error state */}
        {isError && (
          <Animated.View entering={FadeIn} style={styles.errorBlock}>
            <Text style={styles.errorTitle}>Reading Failed</Text>
            <Text style={styles.errorBody}>{readingError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Streaming progress indicator */}
        {isStreaming && completedSections.length > 0 && (
          <Animated.View entering={FadeIn} style={styles.progressRow}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(completedSections.length / readingSections.length) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {completedSections.length}/{readingSections.length} sections
            </Text>
          </Animated.View>
        )}

        {/* Section cards */}
        {readingSections.map((section, i) => (
          <SectionCard key={section.key} section={section} index={i} />
        ))}

        {/* Complete footer */}
        {isComplete && (
          <Animated.View entering={FadeInDown.delay(200)} style={styles.completeFooter}>
            <View style={styles.completeDivider} />
            <Text style={styles.completeLabel}>Your reading is complete</Text>
            <Text style={styles.completeSubtext}>
              Saved to your history
            </Text>
            <TouchableOpacity style={styles.newReadingBtn} onPress={handleDone} activeOpacity={0.85}>
              <Text style={styles.newReadingBtnText}>Return Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.historyBtn}
              onPress={() => {
                resetReading()
                router.replace('/history')
              }}
            >
              <Text style={styles.historyBtnText}>View Past Readings</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  doneBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: Colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  // Thumbnail
  thumbnailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceRaised,
  },
  thumbnailMeta: {
    flex: 1,
    gap: 4,
  },
  thumbnailTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  thumbnailDate: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  completeChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(212,168,75,0.15)',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  completeChipText: {
    ...Typography.label,
    color: Colors.primary,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  // Loader
  loaderWrapper: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
  },
  loaderText: {
    ...Typography.h3,
    color: Colors.primary,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  loaderSubtext: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  // Error
  errorBlock: {
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.error,
    marginVertical: Spacing.lg,
  },
  errorTitle: {
    ...Typography.h2,
    color: Colors.error,
    marginBottom: Spacing.sm,
  },
  errorBody: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  retryBtn: {
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  retryBtnText: {
    ...Typography.body,
    color: Colors.primary,
    fontWeight: '600',
  },
  // Progress
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  progressBar: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  progressText: {
    ...Typography.label,
    color: Colors.textMuted,
    minWidth: 60,
  },
  // Section cards
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionEmoji: {
    fontSize: 16,
  },
  sectionLabel: {
    ...Typography.labelLarge,
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  streamingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.8,
  },
  completeMark: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionContent: {
    ...Typography.body,
    color: Colors.text,
    lineHeight: 26,
  },
  cursor: {
    opacity: 0.8,
  },
  // Complete footer
  completeFooter: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
  },
  completeDivider: {
    width: 48,
    height: 1,
    backgroundColor: Colors.primary,
    opacity: 0.5,
    marginBottom: Spacing.lg,
  },
  completeLabel: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  completeSubtext: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  newReadingBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    width: '100%',
  },
  newReadingBtnText: {
    ...Typography.body,
    color: Colors.bg,
    fontWeight: '700',
  },
  historyBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    width: '100%',
  },
  historyBtnText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
})

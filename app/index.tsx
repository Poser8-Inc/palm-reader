import { useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Canvas, Path, Skia, Group, Paint, Circle, LinearGradient, vec, DashPathEffect } from '@shopify/react-native-skia'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  FadeIn,
  FadeInDown,
  Easing,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme'
import { useStore } from '../lib/store'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const PALM_SIZE = Math.min(SCREEN_WIDTH * 0.72, 320)

// Draw a stylized palm using Skia paths
function PalmIllustration() {
  const glowOpacity = useSharedValue(0.4)

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    )
  }, [])

  const cx = PALM_SIZE / 2
  const cy = PALM_SIZE / 2

  // Palm outline path (simplified hand silhouette)
  const palmPath = Skia.Path.Make()
  // Base of palm
  palmPath.moveTo(cx - 70, cy + 90)
  palmPath.cubicTo(cx - 80, cy + 110, cx - 60, cy + 130, cx - 30, cy + 130)
  palmPath.lineTo(cx + 30, cy + 130)
  palmPath.cubicTo(cx + 60, cy + 130, cx + 80, cy + 110, cx + 70, cy + 90)
  // Pinky
  palmPath.cubicTo(cx + 80, cy + 60, cx + 90, cy + 30, cx + 85, cy + 0)
  palmPath.cubicTo(cx + 83, cy - 15, cx + 73, cy - 20, cx + 65, cy - 10)
  palmPath.cubicTo(cx + 60, cy - 3, cx + 60, cy + 15, cx + 55, cy + 30)
  // Ring finger
  palmPath.cubicTo(cx + 52, cy + 15, cx + 48, cy - 20, cx + 45, cy - 40)
  palmPath.cubicTo(cx + 43, cy - 55, cx + 33, cy - 60, cx + 25, cy - 50)
  palmPath.cubicTo(cx + 18, cy - 42, cx + 18, cy - 20, cx + 20, cy + 20)
  // Middle finger
  palmPath.cubicTo(cx + 17, cy + 5, cx + 10, cy - 35, cx + 7, cy - 58)
  palmPath.cubicTo(cx + 5, cy - 73, cx - 5, cy - 78, cx - 13, cy - 68)
  palmPath.cubicTo(cx - 20, cy - 60, cx - 18, cy - 35, cx - 15, cy + 10)
  // Index finger
  palmPath.cubicTo(cx - 17, cy - 5, cx - 23, cy - 45, cx - 26, cy - 60)
  palmPath.cubicTo(cx - 28, cy - 73, cx - 38, cy - 76, cx - 46, cy - 66)
  palmPath.cubicTo(cx - 53, cy - 58, cx - 50, cy - 30, cx - 47, cy + 10)
  // Thumb area
  palmPath.cubicTo(cx - 50, cy + 0, cx - 62, cy - 10, cx - 72, cy + 5)
  palmPath.cubicTo(cx - 82, cy + 20, cx - 80, cy + 40, cx - 72, cy + 60)
  palmPath.cubicTo(cx - 68, cy + 75, cx - 70, cy + 80, cx - 70, cy + 90)
  palmPath.close()

  // Heart line (curves across upper palm)
  const heartLine = Skia.Path.Make()
  heartLine.moveTo(cx - 55, cy + 10)
  heartLine.cubicTo(cx - 20, cy - 5, cx + 20, cy - 8, cx + 55, cy + 5)

  // Head line (slightly below heart)
  const headLine = Skia.Path.Make()
  headLine.moveTo(cx - 52, cy + 30)
  headLine.cubicTo(cx - 10, cy + 25, cx + 20, cy + 30, cx + 40, cy + 45)

  // Life line (curves around thumb mount)
  const lifeLine = Skia.Path.Make()
  lifeLine.moveTo(cx - 15, cy - 15)
  lifeLine.cubicTo(cx - 30, cy + 20, cx - 35, cy + 60, cx - 25, cy + 100)

  // Fate line (vertical center)
  const fateLine = Skia.Path.Make()
  fateLine.moveTo(cx, cy + 90)
  fateLine.cubicTo(cx - 2, cy + 50, cx + 2, cy + 10, cx, cy - 20)

  return (
    <Canvas style={{ width: PALM_SIZE, height: PALM_SIZE }}>
      {/* Palm fill */}
      <Path path={palmPath} color="rgba(212,168,75,0.08)" />
      {/* Palm outline */}
      <Path
        path={palmPath}
        color={Colors.primary}
        style="stroke"
        strokeWidth={1.5}
        strokeCap="round"
        strokeJoin="round"
        opacity={0.7}
      />
      {/* Heart line */}
      <Path
        path={heartLine}
        color={Colors.lines}
        style="stroke"
        strokeWidth={2}
        strokeCap="round"
        opacity={0.85}
      />
      {/* Head line */}
      <Path
        path={headLine}
        color={Colors.primary}
        style="stroke"
        strokeWidth={1.8}
        strokeCap="round"
        opacity={0.75}
      />
      {/* Life line */}
      <Path
        path={lifeLine}
        color={Colors.accent}
        style="stroke"
        strokeWidth={2}
        strokeCap="round"
        opacity={0.85}
      />
      {/* Fate line */}
      <Path
        path={fateLine}
        color="#6B4C8A"
        style="stroke"
        strokeWidth={1.5}
        strokeCap="round"
        opacity={0.65}
      >
        <DashPathEffect intervals={[4, 3]} />
      </Path>
      {/* Mount dots */}
      <Circle cx={cx - 35} cy={cy - 5} r={3} color={Colors.primary} opacity={0.4} />
      <Circle cx={cx + 35} cy={cy} r={3} color={Colors.lines} opacity={0.4} />
      <Circle cx={cx} cy={cy + 60} r={4} color={Colors.primary} opacity={0.3} />
    </Canvas>
  )
}

export default function HomeScreen() {
  const router = useRouter()
  const { readingsRemaining, setPaywallVisible } = useStore()
  const isPremium = readingsRemaining > 2

  const glowAnim = useSharedValue(0)

  useEffect(() => {
    glowAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    )
  }, [])

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + glowAnim.value * 0.3,
    transform: [{ scale: 1 + glowAnim.value * 0.05 }],
  }))

  const handleCamera = async () => {
    if (readingsRemaining <= 0 && !isPremium) {
      setPaywallVisible(true)
      router.push('/paywall')
      return
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    router.push('/capture')
  }

  const handleLibrary = async () => {
    if (readingsRemaining <= 0 && !isPremium) {
      setPaywallVisible(true)
      router.push('/paywall')
      return
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.push({ pathname: '/capture', params: { mode: 'library' } })
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header row */}
        <Animated.View entering={FadeIn.delay(100)} style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.push('/history')}
            style={styles.historyBtn}
            accessibilityRole="link"
            accessibilityLabel="Past readings"
          >
            <Text style={styles.historyBtnText}>History</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Palm illustration with ambient glow */}
        <Animated.View entering={FadeIn.delay(200)} style={styles.palmWrapper}>
          <Animated.View style={[styles.glow, glowStyle]} />
          <PalmIllustration />
        </Animated.View>

        {/* Headline */}
        <Animated.View entering={FadeInDown.delay(350)} style={styles.headlineBlock}>
          <Text style={styles.headline}>Read Your Palm</Text>
          <Text style={styles.subhead}>Ancient wisdom, modern insight</Text>
          <View style={styles.divider} />
          <Text style={styles.description}>
            Your hands hold the story of your life. Heart, head, and life lines reveal
            personality, potential, and the path ahead. Let AI illuminate what the ancients saw.
          </Text>
        </Animated.View>

        {/* CTA Buttons */}
        <Animated.View entering={FadeInDown.delay(500)} style={styles.buttonBlock}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleCamera}
            accessibilityRole="button"
            accessibilityLabel="Photograph my palm"
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Photograph My Palm</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleLibrary}
            accessibilityRole="button"
            accessibilityLabel="Upload palm photo from library"
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>Upload from Library</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Free tier counter or premium badge */}
        <Animated.View entering={FadeInDown.delay(650)} style={styles.tierBlock}>
          {isPremium ? (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>Premium — Unlimited Readings</Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => router.push('/paywall')}
              style={styles.freeCounter}
              accessibilityRole="link"
              accessibilityLabel={`${readingsRemaining} reading${readingsRemaining !== 1 ? 's' : ''} remaining, upgrade for unlimited`}
              activeOpacity={0.8}
            >
              <Text style={styles.freeCounterText}>
                {readingsRemaining} reading{readingsRemaining !== 1 ? 's' : ''} remaining
              </Text>
              <Text style={styles.freeUpgradeText}>Upgrade for unlimited →</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Legend */}
        <Animated.View entering={FadeInDown.delay(750)} style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.lines }]} />
            <Text style={styles.legendText}>Heart</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
            <Text style={styles.legendText}>Head</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
            <Text style={styles.legendText}>Life</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#6B4C8A' }]} />
            <Text style={styles.legendText}>Fate</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  headerRow: {
    width: '100%',
    alignItems: 'flex-end',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  historyBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  historyBtnText: {
    ...Typography.label,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  palmWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    width: PALM_SIZE * 0.9,
    height: PALM_SIZE * 0.9,
    borderRadius: PALM_SIZE / 2,
    backgroundColor: Colors.primary,
    opacity: 0.3,
  },
  headlineBlock: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  headline: {
    ...Typography.display,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subhead: {
    ...Typography.serif,
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  divider: {
    width: 48,
    height: 1,
    backgroundColor: Colors.primary,
    opacity: 0.4,
    marginBottom: Spacing.md,
  },
  description: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonBlock: {
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryButtonText: {
    ...Typography.h3,
    color: Colors.bg,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryButtonText: {
    ...Typography.h3,
    color: Colors.text,
  },
  tierBlock: {
    marginBottom: Spacing.xl,
    alignItems: 'center',
  },
  premiumBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(212,168,75,0.15)',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  premiumBadgeText: {
    ...Typography.label,
    color: Colors.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  freeCounter: {
    alignItems: 'center',
    gap: 4,
  },
  freeCounterText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
  freeUpgradeText: {
    ...Typography.label,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  legendRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...Typography.label,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
})

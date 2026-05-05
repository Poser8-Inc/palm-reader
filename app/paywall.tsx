import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia'
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import Purchases, { type PurchasesPackage } from 'react-native-purchases'
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme'
import { useStore } from '../lib/store'
import { log } from '../lib/log'

const { width: W } = Dimensions.get('window')

const FEATURES = [
  { emoji: '✦', label: 'Unlimited palm readings' },
  { emoji: '♥', label: 'Full heart, head & life line analysis' },
  { emoji: '★', label: 'Fate line & mount interpretation' },
  { emoji: '◉', label: 'Save & revisit all readings' },
  { emoji: '✧', label: 'Deeper personality insights' },
]

type Plan = 'monthly' | 'annual'

function StarBurst() {
  const rot = useSharedValue(0)
  useEffect(() => {
    rot.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 18000, easing: Easing.linear }),
      -1
    )
  }, [])
  const SIZE = 140
  const cx = SIZE / 2
  const cy = SIZE / 2
  const rays = Skia.Path.Make()
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const x1 = cx + Math.cos(angle) * 20
    const y1 = cy + Math.sin(angle) * 20
    const x2 = cx + Math.cos(angle) * 55
    const y2 = cy + Math.sin(angle) * 55
    rays.moveTo(x1, y1)
    rays.lineTo(x2, y2)
  }
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}rad` }],
  }))
  return (
    <Animated.View style={animStyle}>
      <Canvas style={{ width: SIZE, height: SIZE }}>
        <Circle cx={cx} cy={cy} r={18} color={Colors.primary} opacity={0.2} />
        <Circle cx={cx} cy={cy} r={10} color={Colors.primary} opacity={0.6} />
        <Path path={rays} color={Colors.primary} style="stroke" strokeWidth={1} opacity={0.3} />
      </Canvas>
    </Animated.View>
  )
}

export default function PaywallScreen() {
  const router = useRouter()
  const { setPaywallVisible } = useStore()
  const [selectedPlan, setSelectedPlan] = useState<Plan>('annual')
  const [packages, setPackages] = useState<{
    monthly?: PurchasesPackage
    annual?: PurchasesPackage
  }>({})
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [offeringsError, setOfferingsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const key = Platform.OS === 'ios'
        ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? ''
        : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? ''
      if (!key) {
        log.warn('[rc][palm][paywall-init] RevenueCat key not set')
        if (!cancelled) setOfferingsError('Pricing unavailable. Setup error — please reload the app.')
        return
      }
      // Re-configure defensively. RC SDK is idempotent on identical key; if _layout
      // configure already succeeded this is a no-op. If _layout configure failed,
      // this is the user's last line of defense.
      try {
        Purchases.configure({ apiKey: key })
      } catch (err) {
        log.warn('[rc][palm][paywall-configure] Purchases.configure failed:', err)
        if (!cancelled) setOfferingsError('Pricing unavailable. Setup error — please reload the app.')
        return
      }
      try {
        const offerings = await Purchases.getOfferings()
        if (cancelled) return
        const current = offerings.current
        if (!current) {
          setOfferingsError('Pricing unavailable. Please try again in a moment.')
          return
        }
        const pkgs: typeof packages = {}
        for (const pkg of current.availablePackages) {
          // TODO(IAP-CONFIG-001): consolidate to one ID after RevenueCat dashboard confirms canonical naming.
          if (pkg.identifier === '$rc_monthly' || pkg.identifier === 'monthly') {
            pkgs.monthly = pkg
          }
          if (pkg.identifier === '$rc_annual' || pkg.identifier === 'annual') {
            pkgs.annual = pkg
          }
        }
        if (Object.keys(pkgs).length === 0 && current.availablePackages.length > 0) {
          log.warn(
            '[rc][palm][paywall-offerings] RevenueCat returned packages but none matched expected IDs. ' +
            'Got:', current.availablePackages.map(p => p.identifier),
            '— expected one of: $rc_monthly, monthly, $rc_annual, annual'
          )
          setOfferingsError('Pricing unavailable. Please contact support.')
          return
        }
        setPackages(pkgs)
      } catch (err) {
        if (cancelled) return
        log.warn('[rc][palm][paywall-offerings] getOfferings failed:', err)
        setOfferingsError('Pricing unavailable. Check your connection and try again.')
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  const handlePurchase = async () => {
    const pkg = selectedPlan === 'annual' ? packages.annual : packages.monthly
    if (!pkg) {
      Alert.alert('Not available', 'Purchase options are not available right now. Please try again later.')
      return
    }
    setIsPurchasing(true)
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg)
      // TODO(IAP-CONFIG-002): verify 'premium' is the entitlement ID in RevenueCat dashboard.
      if (customerInfo.entitlements.active['premium']) {
        setPaywallVisible(false)
        router.replace('/')
        Alert.alert('Welcome to Premium!', 'You now have unlimited palm readings.')
      }
    } catch (err: any) {
      if (err.userCancelled) {
        // User cancelled — no alert needed
        return
      }
      log.warn('[rc][palm][purchase] purchasePackage failed:', err)
      Alert.alert('Purchase Failed', err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setIsPurchasing(false)
    }
  }

  const handleRestore = async () => {
    setIsRestoring(true)
    try {
      const customerInfo = await Purchases.restorePurchases()
      // TODO(IAP-CONFIG-002): verify 'premium' is the entitlement ID in RevenueCat dashboard.
      if (customerInfo.entitlements.active['premium']) {
        setPaywallVisible(false)
        router.replace('/')
        Alert.alert('Purchases Restored', 'Your premium access has been restored.')
      } else {
        Alert.alert('No Purchases Found', 'No previous purchases were found for this account.')
      }
    } catch (err: any) {
      log.warn('[rc][palm][restore] restorePurchases failed:', err)
      Alert.alert('Restore Failed', err.message ?? 'Could not restore purchases.')
    } finally {
      setIsRestoring(false)
    }
  }

  const handleClose = () => {
    setPaywallVisible(false)
    router.back()
  }

  const monthlyPrice = packages.monthly?.product.priceString ?? '—'
  const annualPrice = packages.annual?.product.priceString ?? '—'
  const annualMonthly = packages.annual
    ? `$${(packages.annual.product.price / 12).toFixed(2)}/mo`
    : '—'

  return (
    <SafeAreaView style={styles.container}>
      {/* Close button */}
      <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
        <Text style={styles.closeBtnText}>✕</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Animated.View entering={FadeIn.delay(100)} style={styles.hero}>
          <StarBurst />
          <Text style={styles.heroTitle}>Unlock Unlimited{'\n'}Readings</Text>
          <Text style={styles.heroSubtitle}>
            Deepen your self-understanding with unlimited palm readings and full line analysis
          </Text>
        </Animated.View>

        {/* Features */}
        <Animated.View entering={FadeInDown.delay(250)} style={styles.features}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.featureEmoji}>{f.emoji}</Text>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Offerings error banner */}
        {offeringsError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{offeringsError}</Text>
          </View>
        )}

        {/* Plan selector */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.planBlock}>
          {/* Annual */}
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'annual' && styles.planCardSelected]}
            onPress={() => setSelectedPlan('annual')}
            activeOpacity={0.8}
          >
            <View style={styles.planCardLeft}>
              <View style={[styles.planRadio, selectedPlan === 'annual' && styles.planRadioSelected]}>
                {selectedPlan === 'annual' && <View style={styles.planRadioDot} />}
              </View>
            </View>
            <View style={styles.planCardContent}>
              <View style={styles.planTitleRow}>
                <Text style={[styles.planTitle, selectedPlan === 'annual' && styles.planTitleSelected]}>
                  Annual
                </Text>
                <View style={styles.saveBadge}>
                  <Text style={styles.saveBadgeText}>SAVE 50%</Text>
                </View>
              </View>
              <Text style={styles.planSubtitle}>{annualMonthly} · billed {annualPrice}/year</Text>
            </View>
          </TouchableOpacity>

          {/* Monthly */}
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'monthly' && styles.planCardSelected]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.8}
          >
            <View style={styles.planCardLeft}>
              <View style={[styles.planRadio, selectedPlan === 'monthly' && styles.planRadioSelected]}>
                {selectedPlan === 'monthly' && <View style={styles.planRadioDot} />}
              </View>
            </View>
            <View style={styles.planCardContent}>
              <Text style={[styles.planTitle, selectedPlan === 'monthly' && styles.planTitleSelected]}>
                Monthly
              </Text>
              <Text style={styles.planSubtitle}>{monthlyPrice}/month · cancel anytime</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={FadeInDown.delay(550)} style={styles.ctaBlock}>
          <TouchableOpacity
            style={[
              styles.ctaBtn,
              isPurchasing && styles.ctaBtnLoading,
              (offeringsError !== null || !packages[selectedPlan]) && styles.ctaBtnLoading,
            ]}
            onPress={handlePurchase}
            disabled={
              isPurchasing ||
              isRestoring ||
              offeringsError !== null ||
              !packages[selectedPlan]
            }
            activeOpacity={0.85}
          >
            {isPurchasing ? (
              <ActivityIndicator color={Colors.bg} />
            ) : (
              <Text style={styles.ctaBtnText}>
                {packages[selectedPlan]
                  ? `Get ${selectedPlan === 'annual' ? annualPrice + '/year' : monthlyPrice + '/month'}`
                  : 'Pricing Unavailable'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.restoreBtn}
            onPress={handleRestore}
            disabled={isPurchasing || isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator color={Colors.textMuted} size="small" />
            ) : (
              <Text style={styles.restoreBtnText}>Restore Purchases</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.legal}>
            Subscription auto-renews. Cancel anytime in App Store / Google Play settings.
          </Text>
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
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: Spacing.lg,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  closeBtnText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  heroTitle: {
    ...Typography.h1,
    color: Colors.text,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  heroSubtitle: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: Spacing.md,
  },
  // Features
  features: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  errorBanner: {
    backgroundColor: 'rgba(220,80,80,0.12)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(220,80,80,0.4)',
  },
  errorBannerText: {
    ...Typography.bodySmall,
    color: '#ffb3b3',
    textAlign: 'center',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  featureEmoji: {
    fontSize: 18,
    color: Colors.primary,
    width: 28,
    textAlign: 'center',
  },
  featureLabel: {
    ...Typography.body,
    color: Colors.text,
    flex: 1,
  },
  // Plan cards
  planBlock: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  planCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(212,168,75,0.06)',
  },
  planCardLeft: {
    justifyContent: 'center',
  },
  planRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioSelected: {
    borderColor: Colors.primary,
  },
  planRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  planCardContent: {
    flex: 1,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  planTitle: {
    ...Typography.h3,
    color: Colors.textMuted,
  },
  planTitleSelected: {
    color: Colors.text,
  },
  planSubtitle: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  saveBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(212,168,75,0.2)',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  saveBadgeText: {
    ...Typography.label,
    color: Colors.primary,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  // CTA
  ctaBlock: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  ctaBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    width: '100%',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaBtnLoading: {
    opacity: 0.7,
  },
  ctaBtnText: {
    ...Typography.h3,
    color: Colors.bg,
    fontWeight: '700',
  },
  restoreBtn: {
    paddingVertical: 8,
    paddingHorizontal: Spacing.lg,
  },
  restoreBtnText: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  legal: {
    ...Typography.label,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.7,
    paddingHorizontal: Spacing.md,
  },
})

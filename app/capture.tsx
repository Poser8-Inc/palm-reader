import { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { Canvas, Path, Skia, Group, DashPathEffect } from '@shopify/react-native-skia'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated'
import Purchases from 'react-native-purchases'
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme'
import { useStore } from '../lib/store'
import { log } from '../lib/log'

const { width: W, height: H } = Dimensions.get('window')

// SVG/Skia hand outline guide overlay
function HandGuideOverlay() {
  const pulseOpacity = useSharedValue(0.5)

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.5, { duration: 1500, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    )
  }, [])

  // Centered guide box dimensions
  const boxW = W * 0.78
  const boxH = W * 0.88
  const boxX = (W - boxW) / 2
  const boxY = (H - boxH) / 2 - 40

  const cx = boxX + boxW / 2
  const cy = boxY + boxH / 2

  // Simplified palm guide outline (scaled to box)
  const scale = boxW / 320
  const outline = Skia.Path.Make()

  // Base of palm
  outline.moveTo(cx - 70 * scale, cy + 70 * scale)
  outline.cubicTo(cx - 80 * scale, cy + 90 * scale, cx - 60 * scale, cy + 110 * scale, cx - 30 * scale, cy + 110 * scale)
  outline.lineTo(cx + 30 * scale, cy + 110 * scale)
  outline.cubicTo(cx + 60 * scale, cy + 110 * scale, cx + 80 * scale, cy + 90 * scale, cx + 70 * scale, cy + 70 * scale)
  // Pinky
  outline.cubicTo(cx + 80 * scale, cy + 40 * scale, cx + 90 * scale, cy + 10 * scale, cx + 85 * scale, cy - 20 * scale)
  outline.cubicTo(cx + 83 * scale, cy - 35 * scale, cx + 73 * scale, cy - 40 * scale, cx + 65 * scale, cy - 30 * scale)
  outline.cubicTo(cx + 60 * scale, cy - 23 * scale, cx + 60 * scale, cy - 5 * scale, cx + 55 * scale, cy + 10 * scale)
  // Ring
  outline.cubicTo(cx + 52 * scale, cy - 5 * scale, cx + 48 * scale, cy - 40 * scale, cx + 45 * scale, cy - 60 * scale)
  outline.cubicTo(cx + 43 * scale, cy - 75 * scale, cx + 33 * scale, cy - 80 * scale, cx + 25 * scale, cy - 70 * scale)
  outline.cubicTo(cx + 18 * scale, cy - 62 * scale, cx + 18 * scale, cy - 40 * scale, cx + 20 * scale, cy)
  // Middle
  outline.cubicTo(cx + 17 * scale, cy - 15 * scale, cx + 10 * scale, cy - 55 * scale, cx + 7 * scale, cy - 78 * scale)
  outline.cubicTo(cx + 5 * scale, cy - 93 * scale, cx - 5 * scale, cy - 98 * scale, cx - 13 * scale, cy - 88 * scale)
  outline.cubicTo(cx - 20 * scale, cy - 80 * scale, cx - 18 * scale, cy - 55 * scale, cx - 15 * scale, cy - 10 * scale)
  // Index
  outline.cubicTo(cx - 17 * scale, cy - 25 * scale, cx - 23 * scale, cy - 65 * scale, cx - 26 * scale, cy - 80 * scale)
  outline.cubicTo(cx - 28 * scale, cy - 93 * scale, cx - 38 * scale, cy - 96 * scale, cx - 46 * scale, cy - 86 * scale)
  outline.cubicTo(cx - 53 * scale, cy - 78 * scale, cx - 50 * scale, cy - 50 * scale, cx - 47 * scale, cy - 10 * scale)
  // Thumb
  outline.cubicTo(cx - 50 * scale, cy - 20 * scale, cx - 62 * scale, cy - 30 * scale, cx - 72 * scale, cy - 15 * scale)
  outline.cubicTo(cx - 82 * scale, cy, cx - 80 * scale, cy + 20 * scale, cx - 72 * scale, cy + 40 * scale)
  outline.cubicTo(cx - 68 * scale, cy + 55 * scale, cx - 70 * scale, cy + 60 * scale, cx - 70 * scale, cy + 70 * scale)
  outline.close()

  const animStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }))

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Dim overlay with cutout suggestion */}
      <View style={[StyleSheet.absoluteFill, styles.guideOverlay]} />
      <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
        <Canvas style={{ width: W, height: H }}>
          <Path
            path={outline}
            color={Colors.primary}
            style="stroke"
            strokeWidth={2}
            strokeCap="round"
            strokeJoin="round"
          >
            <DashPathEffect intervals={[8, 5]} />
          </Path>
        </Canvas>
      </Animated.View>
    </View>
  )
}

type ScreenMode = 'camera' | 'preview'

export default function CaptureScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ mode?: string }>()
  const [permission, requestPermission] = useCameraPermissions()
  const [facing] = useState<CameraType>('back')
  const [mode, setMode] = useState<ScreenMode>('camera')
  const [capturedUri, setCapturedUri] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const cameraRef = useRef<CameraView>(null)
  const { setCapturedImageUri } = useStore()

  // Auto-open library picker if mode=library
  useEffect(() => {
    if (params.mode === 'library') {
      handleLibraryPick()
    }
  }, [])

  const handleLibraryPick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Please allow access to your photo library.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    })

    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri)
      setMode('preview')
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }
  }

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return

    setIsCapturing(true)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        exif: false,
        skipProcessing: false,
      })
      if (photo) {
        setCapturedUri(photo.uri)
        setMode('preview')
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }
    } catch (err) {
      log.error('[capture] takePicture error:', err)
      Alert.alert('Capture Failed', 'Please try again.')
    } finally {
      setIsCapturing(false)
    }
  }

  const handleUsePhoto = async () => {
    if (!capturedUri) return

    // Check entitlement before proceeding to reading
    let isPremium = false
    try {
      const customerInfo = await Purchases.getCustomerInfo()
      // TODO(IAP-CONFIG-002): verify 'premium' is the entitlement ID in RevenueCat dashboard.
      isPremium = !!customerInfo.entitlements.active['premium']
    } catch (err) {
      log.warn('[rc][palm][capture] getCustomerInfo failed:', err)
      // isPremium stays false (defensive). Don't reroute to paywall on transient RC errors —
      // free-tier counter-based gate below already enforces correct UX.
    }

    const { readingsRemaining } = useStore.getState()
    if (!isPremium && readingsRemaining <= 0) {
      router.push('/paywall')
      return
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setCapturedImageUri(capturedUri)
    router.push('/reading')
  }

  const handleRetake = () => {
    setCapturedUri(null)
    setMode('camera')
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  // Permission not yet determined
  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionBlock}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={[styles.permissionBody, { marginTop: Spacing.md }]}>
            Checking camera permission…
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionBlock}>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionBody}>
            Palm Reader needs your camera to photograph your palm for analysis.
          </Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.permissionSecondary}
            onPress={handleLibraryPick}
          >
            <Text style={styles.permissionSecondaryText}>Use Photo Library Instead</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // Preview mode
  if (mode === 'preview' && capturedUri) {
    return (
      <View style={styles.container}>
        <Animated.View entering={FadeIn} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: capturedUri }} style={styles.previewImage} resizeMode="cover" />
        </Animated.View>

        {/* Dark top overlay */}
        <View style={styles.previewTopOverlay}>
          <SafeAreaView>
            <Text style={styles.previewTitle}>Use This Photo?</Text>
            <Text style={styles.previewSubtitle}>
              Make sure your palm lines are clearly visible
            </Text>
          </SafeAreaView>
        </View>

        {/* Bottom actions */}
        <View style={styles.previewBottomOverlay}>
          <SafeAreaView style={styles.previewActions} edges={['bottom']}>
            <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake} activeOpacity={0.8}>
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.usePhotoBtn}
              onPress={handleUsePhoto}
              activeOpacity={0.85}
            >
              <Text style={styles.usePhotoBtnText}>Read My Palm →</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </View>
    )
  }

  // Camera mode
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        enableTorch={false}
      />

      {/* Guide overlay */}
      <HandGuideOverlay />

      {/* Top instructions */}
      <SafeAreaView style={styles.topInstructions}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.instructionBox}>
          <Text style={styles.instructionTitle}>Position Your Palm</Text>
          <Text style={styles.instructionBody}>
            Hold your dominant hand flat, fingers together, palm facing camera.
            Ensure all main lines are visible.
          </Text>
        </View>
      </SafeAreaView>

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        <SafeAreaView style={styles.controlsRow} edges={['bottom']}>
          {/* Library picker */}
          <TouchableOpacity style={styles.libraryBtn} onPress={handleLibraryPick}>
            <Text style={styles.libraryBtnText}>Library</Text>
          </TouchableOpacity>

          {/* Shutter */}
          <TouchableOpacity
            style={[styles.shutter, isCapturing && styles.shutterActive]}
            onPress={handleCapture}
            disabled={isCapturing}
            activeOpacity={0.85}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          {/* Spacer for symmetry */}
          <View style={styles.libraryBtn} />
        </SafeAreaView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  guideOverlay: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  // Permission screen
  permissionBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  permissionTitle: {
    ...Typography.h1,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  permissionBody: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  permissionBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  permissionBtnText: {
    ...Typography.h3,
    color: Colors.bg,
    fontWeight: '700',
  },
  permissionSecondary: {
    paddingVertical: 12,
    alignItems: 'center',
    width: '100%',
  },
  permissionSecondaryText: {
    ...Typography.body,
    color: Colors.primary,
  },
  backBtn: {
    marginTop: Spacing.xl,
    padding: Spacing.sm,
  },
  backBtnText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
  // Camera top
  topInstructions: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    margin: Spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  instructionBox: {
    marginHorizontal: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(212,168,75,0.3)',
  },
  instructionTitle: {
    ...Typography.h3,
    color: Colors.primary,
    marginBottom: 4,
  },
  instructionBody: {
    ...Typography.bodySmall,
    color: Colors.text,
    lineHeight: 20,
  },
  // Camera bottom
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingTop: Spacing.lg,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  libraryBtn: {
    width: 64,
    alignItems: 'center',
  },
  libraryBtnText: {
    ...Typography.label,
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,168,75,0.15)',
  },
  shutterActive: {
    borderColor: Colors.text,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
  },
  // Preview
  previewImage: {
    flex: 1,
  },
  previewTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10,11,15,0.85)',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  previewTitle: {
    ...Typography.h2,
    color: Colors.text,
    marginBottom: 4,
  },
  previewSubtitle: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  previewBottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10,11,15,0.9)',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  previewActions: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
    alignItems: 'center',
  },
  retakeBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  retakeBtnText: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600',
  },
  usePhotoBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  usePhotoBtnText: {
    ...Typography.body,
    color: Colors.bg,
    fontWeight: '700',
  },
})

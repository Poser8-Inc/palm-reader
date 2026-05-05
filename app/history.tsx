import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme'
import { useStore } from '../lib/store'
import { getPastReadings, type Reading } from '../lib/supabase'
import { log } from '../lib/log'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function ReadingDetailModal({
  reading,
  onClose,
}: {
  reading: Reading | null
  onClose: () => void
}) {
  if (!reading) return null

  const sections = [
    { key: 'heart_line', label: 'Heart Line', emoji: '♥', color: Colors.lines, content: reading.heart_line },
    { key: 'head_line', label: 'Head Line', emoji: '◈', color: Colors.primary, content: reading.head_line },
    { key: 'life_line', label: 'Life Line', emoji: '✦', color: Colors.accent, content: reading.life_line },
    { key: 'fate_line', label: 'Fate Line', emoji: '★', color: '#6B4C8A', content: reading.fate_line },
    { key: 'mounts', label: 'The Mounts', emoji: '◉', color: '#4A6B8A', content: reading.mounts },
    { key: 'overall', label: 'Overall Reading', emoji: '✧', color: Colors.primary, content: reading.overall },
  ]

  return (
    <Modal visible={!!reading} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalContainer}>
        {/* Modal header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Palm Reading</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={styles.modalCloseBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          {/* Thumbnail + date */}
          <View style={styles.modalThumbRow}>
            {reading.image_thumbnail ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${reading.image_thumbnail}` }}
                style={styles.modalThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.modalThumb, styles.modalThumbPlaceholder]}>
                <Text style={{ fontSize: 28 }}>🖐</Text>
              </View>
            )}
            <View style={styles.modalThumbMeta}>
              <Text style={styles.modalThumbTitle}>Your Palm</Text>
              <Text style={styles.modalThumbDate}>{formatDate(reading.created_at)}</Text>
            </View>
          </View>

          {/* Sections */}
          {sections.map((s, i) =>
            s.content ? (
              <Animated.View
                key={s.key}
                entering={FadeInDown.delay(i * 60)}
                style={[styles.sectionCard, { borderLeftColor: s.color }]}
              >
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionEmoji}>{s.emoji}</Text>
                  <Text style={[styles.sectionLabel, { color: s.color }]}>{s.label}</Text>
                </View>
                <Text style={styles.sectionContent}>{s.content}</Text>
              </Animated.View>
            ) : null
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

function HistoryCard({
  reading,
  onPress,
  index,
}: {
  reading: Reading
  onPress: () => void
  index: number
}) {
  const preview = reading.overall || reading.heart_line || reading.raw_reading || ''
  const previewText = preview.slice(0, 90) + (preview.length > 90 ? '...' : '')

  return (
    <Animated.View entering={FadeInDown.delay(index * 80)}>
      <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
        {reading.image_thumbnail ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${reading.image_thumbnail}` }}
            style={styles.cardThumb}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cardThumb, styles.cardThumbPlaceholder]}>
            <Text style={{ fontSize: 24 }}>🖐</Text>
          </View>
        )}
        <View style={styles.cardContent}>
          <Text style={styles.cardDate}>{formatDate(reading.created_at)}</Text>
          {previewText ? (
            <Text style={styles.cardPreview} numberOfLines={2}>
              {previewText}
            </Text>
          ) : null}
          <View style={styles.cardLineIndicators}>
            {reading.heart_line && <View style={[styles.lineIndicator, { backgroundColor: Colors.lines }]} />}
            {reading.head_line && <View style={[styles.lineIndicator, { backgroundColor: Colors.primary }]} />}
            {reading.life_line && <View style={[styles.lineIndicator, { backgroundColor: Colors.accent }]} />}
            {reading.fate_line && <View style={[styles.lineIndicator, { backgroundColor: '#6B4C8A' }]} />}
          </View>
        </View>
        <Text style={styles.cardChevron}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  )
}

export default function HistoryScreen() {
  const router = useRouter()
  const { userId, history, setHistory } = useStore()
  const [loading, setLoading] = useState(true)
  const [selectedReading, setSelectedReading] = useState<Reading | null>(null)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setLoading(true)
    try {
      const readings = await getPastReadings(userId ?? 'anonymous')
      setHistory(readings)
    } catch (err) {
      log.error('[history] Load failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Past Readings</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading your readings...</Text>
        </View>
      ) : history.length === 0 ? (
        <Animated.View entering={FadeIn} style={styles.emptyBlock}>
          <Text style={styles.emptyEmoji}>🖐</Text>
          <Text style={styles.emptyTitle}>No Readings Yet</Text>
          <Text style={styles.emptyBody}>
            Photograph your palm and discover what the lines reveal about your life path.
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.replace('/')}>
            <Text style={styles.emptyBtnText}>Get Your First Reading</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <HistoryCard
              reading={item}
              index={index}
              onPress={() => setSelectedReading(item)}
            />
          )}
        />
      )}

      <ReadingDetailModal
        reading={selectedReading}
        onClose={() => setSelectedReading(null)}
      />
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
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backBtnText: {
    ...Typography.body,
    color: Colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  loadingBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
  emptyBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.h2,
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyBody: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  emptyBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  emptyBtnText: {
    ...Typography.body,
    color: Colors.bg,
    fontWeight: '700',
  },
  list: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardThumb: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceRaised,
  },
  cardThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardDate: {
    ...Typography.labelLarge,
    color: Colors.primary,
  },
  cardPreview: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  cardLineIndicators: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  lineIndicator: {
    width: 12,
    height: 3,
    borderRadius: 2,
  },
  cardChevron: {
    fontSize: 22,
    color: Colors.textMuted,
    fontWeight: '300',
  },
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  modalCloseBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  modalCloseBtnText: {
    ...Typography.body,
    color: Colors.primary,
    fontWeight: '600',
  },
  modalScroll: {
    flex: 1,
  },
  modalThumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalThumb: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceRaised,
  },
  modalThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalThumbMeta: {
    flex: 1,
    gap: 4,
  },
  modalThumbTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  modalThumbDate: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
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
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionContent: {
    ...Typography.body,
    color: Colors.text,
    lineHeight: 26,
  },
})

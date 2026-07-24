// Headless Templari ID bridge: handles central magic-link callbacks and the
// post-sign-in anon-claim/RevenueCat alias flow. Renders nothing.
// Mirrors the_hidden_library/app/lib/TemplariMount.tsx.

import { useEffect, useRef } from 'react'
import * as Linking from 'expo-linking'
import { useTemplariId } from '@templari/identity'
import { log } from './log'
import { configureTemplariId, completeMagicLinkSafe, runPostSignInBridge } from './templariId'

export function TemplariMount(): null {
  const { tid } = useTemplariId()
  const lastTid = useRef<string | null>(null)

  useEffect(() => {
    let mounted = true
    let sub: { remove: () => void } | undefined

    const handle = async (url: string | null) => {
      if (!url) return
      try {
        const parsed = Linking.parse(url)
        const host = parsed.hostname ?? ''
        const firstPath = (parsed.path ?? '').split('/').filter(Boolean)[0] ?? ''
        const isAuthCallback = host === 'auth' || host === 'auth-callback' || firstPath === 'auth'
        if (!isAuthCallback) return

        const tokenHash =
          (parsed.queryParams?.token_hash as string | undefined) ??
          (parsed.queryParams?.token as string | undefined)
        if (!tokenHash) {
          log.warn('[templari-id][palm] callback missing token_hash:', url)
          return
        }
        await completeMagicLinkSafe({ token_hash: tokenHash })
        log.info('[templari-id][palm] magic link verified')
      } catch (err) {
        log.warn('[templari-id][palm] callback failed:', err)
      }
    }

    void (async () => {
      await configureTemplariId()
      if (!mounted) return
      await handle(await Linking.getInitialURL())
      if (!mounted) return
      sub = Linking.addEventListener('url', (event) => {
        void handle(event.url)
      })
    })()

    return () => {
      mounted = false
      sub?.remove()
    }
  }, [])

  useEffect(() => {
    if (!tid) {
      lastTid.current = null
      return
    }
    if (lastTid.current === tid) return
    lastTid.current = tid
    void runPostSignInBridge(tid)
  }, [tid])

  return null
}

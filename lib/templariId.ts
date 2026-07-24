// Templari ID integration for Palm Reader.
// Gated by EXPO_PUBLIC_TEMPLARI_ID_ENABLED so builds without the flag keep the
// existing per-app anonymous Supabase auth path untouched.
//
// Purpose: tie the RevenueCat app_user_id to the central templari_id so a
// purchase made in Palm Reader carries cross-device and into the shared
// apprentice_suite entitlement (instead of being stranded on an anonymous
// per-install RC user). Mirrors the_hidden_library/app/lib/templariId.ts.

import {
  claimExistingAnon,
  completeMagicLink,
  configure,
  requestMagicLink,
  signOut,
} from '@templari/identity'
// Palm Reader is native-only (no web deploy), so call react-native-purchases
// directly rather than HL's platform-aware web facade.
import Purchases from 'react-native-purchases'
import { log } from './log'
import { supabase } from './supabase'

export const TEMPLARI_ID_ENABLED =
  process.env.EXPO_PUBLIC_TEMPLARI_ID_ENABLED === 'true'

// Central Templari ID project (shared across the Suite). Publishable key is
// public by design (safe to embed in the client bundle).
const CENTRAL_SUPABASE_URL = 'https://bexnxyserggyvxfnuoqi.supabase.co'
const CENTRAL_ANON_KEY = 'sb_publishable_QrDUM87NMxFteS-9e1IO1Q_G0-Y8XU3'

let configured = false
let bridgeRunInFlight: Promise<void> | null = null

export async function configureTemplariId(): Promise<void> {
  if (!TEMPLARI_ID_ENABLED || configured) return
  try {
    configure({
      supabaseUrl: CENTRAL_SUPABASE_URL,
      anonKey: CENTRAL_ANON_KEY,
      appSlug: 'palmreader',
    })
    configured = true
    log.info('[templari-id][palm] configured')
  } catch (err) {
    log.warn('[templari-id][palm] configure failed:', err)
  }
}

// Eager synchronous configure at module load so useTemplariId() is safe even
// if a component (e.g. /templari-sign-in) renders before _layout's effect.
// Idempotent via the `configured` guard.
void configureTemplariId()

export async function requestMagicLinkSafe(
  email: string,
  opts?: { redirectTo?: string },
): Promise<void> {
  if (!TEMPLARI_ID_ENABLED) {
    throw new Error('Templari ID is not enabled in this build.')
  }
  await configureTemplariId()
  await requestMagicLink(email, opts)
}

export async function completeMagicLinkSafe(params: {
  token_hash: string
  type?: 'magiclink' | 'signup' | 'email'
}): Promise<void> {
  if (!TEMPLARI_ID_ENABLED) return
  await configureTemplariId()
  await completeMagicLink(params)
}

export async function signOutTemplariSafe(): Promise<void> {
  if (!TEMPLARI_ID_ENABLED) return
  await configureTemplariId()
  await signOut()
}

async function getPerAppAnonUuid(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    log.warn('[templari-id][palm] get per-app user failed:', error.message)
    return null
  }
  return data.user?.id ?? null
}

// On sign-in: link the per-app anon Supabase user to the central templari_id,
// then alias RevenueCat (app_user_id == templari_id) so the purchase migrates
// to the central identity. Idempotent + single-flight.
export async function runPostSignInBridge(tid: string): Promise<void> {
  if (!TEMPLARI_ID_ENABLED) return
  if (bridgeRunInFlight) return bridgeRunInFlight
  bridgeRunInFlight = (async () => {
    try {
      try {
        const anonUuid = await getPerAppAnonUuid()
        if (anonUuid) {
          const result = await claimExistingAnon(anonUuid)
          log.info('[templari-id][palm] claimExistingAnon ok', {
            alreadyLinked: result.alreadyLinked,
          })
        } else {
          log.info('[templari-id][palm] claim_anon skipped (no per-app anon uuid)')
        }
      } catch (err: any) {
        const ctx = err?.context ?? err?.cause?.context ?? null
        let bodyText: string | null = null
        if (ctx && typeof ctx.text === 'function') {
          try { bodyText = await ctx.text() } catch { /* ignore */ }
        }
        log.warn('[templari-id][palm] claimExistingAnon failed:', {
          message: err?.message ?? String(err),
          status: ctx?.status ?? null,
          body: bodyText,
        })
      }

      try {
        await Purchases.logIn(tid)
        log.info('[templari-id][palm] RC logIn(tid) ok')
      } catch (err) {
        log.warn('[templari-id][palm] RC logIn(tid) failed:', err)
      }
    } finally {
      bridgeRunInFlight = null
    }
  })()
  return bridgeRunInFlight
}

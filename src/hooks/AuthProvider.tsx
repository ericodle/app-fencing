import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AuthContext } from './auth-context'
import type { Profile } from '../types/db'

// One subscription for the whole tree.
//
// The alternative — every component that needs the session running its own
// useState + onAuthStateChange — gives each one its own copy of the state and
// its own race. On sign-out, one component clears its profile while another
// still holds the previous member's, and people see someone else's data flash
// back briefly before the cascade catches up. That is a real bug, not a
// theoretical one, and this is the shape that prevents it.

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user,    setUser]    = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Which member's profile currently sits in `profile`. Lets onAuthStateChange
  // tell a fresh sign-in or an account switch (must gate on `loading` until the
  // new profile arrives) apart from a token refresh for the same person
  // (profile already in hand — re-fetch silently, no spinner flash).
  const loadedForRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadProfile(userId: string) {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (cancelled) return
      loadedForRef.current = data ? userId : null
      setProfile(data)
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) void loadProfile(data.session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setUser(next?.user ?? null)
      if (next?.user) {
        // Gate the app on `loading` until THIS member's profile has landed. On
        // a fresh sign-in the profile is still null, so without this the route
        // guards evaluate profile=null and bounce an active member through to
        // /pending before the fetch returns.
        if (loadedForRef.current !== next.user.id) setLoading(true)
        void loadProfile(next.user.id)
      } else {
        loadedForRef.current = null
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  async function refreshProfile() {
    const { data: { user: current } } = await supabase.auth.getUser()
    if (!current) return
    const { data } = await supabase.from('profiles').select('*').eq('id', current.id).single()
    setProfile(data)
  }

  async function signOut() {
    // scope 'local' invalidates only this device's session. The default
    // ('global') revokes the member's refresh tokens server-side, which signs
    // them out of every device they are logged in on — not what anyone expects
    // from signing out of one browser.
    await supabase.auth.signOut({ scope: 'local' })
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

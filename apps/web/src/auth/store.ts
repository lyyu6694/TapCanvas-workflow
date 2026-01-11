import { create } from 'zustand'

export type User = { sub: string | number; login: string; name?: string; avatarUrl?: string; email?: string; role?: string | null; guest?: boolean }

function base64UrlDecode(input: string): string {
  input = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = input.length % 4
  if (pad) input += '='.repeat(4 - pad)
  try { return atob(input) } catch { return '' }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function decodeJwtUser(token: string | null): User | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]))
    const u: User = { sub: payload.sub, login: payload.login, name: payload.name, avatarUrl: payload.avatarUrl, email: payload.email, role: payload.role ?? null, guest: payload.guest }
    return u
  } catch { return null }
}

const initialToken = (() => {
  const local = typeof localStorage !== 'undefined' ? localStorage.getItem('tap_token') : null
  if (local) return local
  return readCookie('tap_token')
})()
const initialUser = (() => {
  const decoded = decodeJwtUser(initialToken)
  const cachedRaw = localStorage.getItem('tap_user')
  const cached = (() => {
    if (!cachedRaw) return null
    try {
      return JSON.parse(cachedRaw) as User
    } catch {
      return null
    }
  })()

  // Prefer token as source of truth (especially for role), then fill from cached.
  if (decoded && cached) {
    return { ...cached, ...decoded, role: decoded.role ?? cached.role ?? null }
  }
  return decoded || cached
})()

type AuthState = {
  token: string | null
  user: User | null
  loading: boolean
  codeSentTo: string | null
  // Email verification flow
  sendCode: (email: string) => Promise<{ success: boolean; error?: string }>
  verifyCode: (email: string, code: string, invitationCode?: string) => Promise<{ success: boolean; error?: string }>
  // Guest login
  loginAsGuest: (nickname?: string) => Promise<void>
  // Auth management
  setAuth: (token: string, user?: User | null) => void
  clear: () => void
}

export const useAuth = create<AuthState>((set, get) => ({
  token: initialToken,
  user: initialUser,
  loading: false,
  codeSentTo: null,

  sendCode: async (email: string) => {
    set({ loading: true })
    try {
      const { sendVerificationCode } = await import('../api/server')
      const result = await sendVerificationCode(email)
      if (result.success) {
        set({ codeSentTo: email })
      }
      return result
    } catch (error: any) {
      console.error('Send code failed:', error)
      return { success: false, error: error?.message || '发送验证码失败' }
    } finally {
      set({ loading: false })
    }
  },

  verifyCode: async (email: string, code: string, invitationCode?: string) => {
    set({ loading: true })
    try {
      const { verifyEmailCode } = await import('../api/server')
      const result = await verifyEmailCode(email, code, invitationCode)
      if (result.success && result.token) {
        get().setAuth(result.token, result.user)
        set({ codeSentTo: null })
      }
      return { success: result.success, error: result.error }
    } catch (error: any) {
      console.error('Verify code failed:', error)
      return { success: false, error: error?.message || '验证失败' }
    } finally {
      set({ loading: false })
    }
  },

  loginAsGuest: async (nickname?: string) => {
    set({ loading: true })
    try {
      const { createGuestSession } = await import('../api/server')
      const { token, user } = await createGuestSession(nickname)
      get().setAuth(token, user)
    } catch (error: any) {
      console.error('Guest login failed:', error)
      throw error
    } finally {
      set({ loading: false })
    }
  },

  setAuth: (token, user) => {
    localStorage.setItem('tap_token', token)
    const decoded = decodeJwtUser(token)
    const u = (() => {
      if (!decoded && !user) return null
      const merged: User = { ...(user || ({} as any)), ...(decoded || ({} as any)) }
      merged.role = (user as any)?.role ?? decoded?.role ?? null
      merged.sub = (user as any)?.sub ?? decoded?.sub
      merged.login = (user as any)?.login ?? decoded?.login
      merged.name = (user as any)?.name ?? decoded?.name
      merged.avatarUrl = (user as any)?.avatarUrl ?? decoded?.avatarUrl
      merged.email = (user as any)?.email ?? decoded?.email
      merged.guest = (user as any)?.guest ?? decoded?.guest
      return merged
    })()
    if (u) localStorage.setItem('tap_user', JSON.stringify(u)); else localStorage.removeItem('tap_user')
    set({ token, user: u || null })
  },
  clear: () => { localStorage.removeItem('tap_token'); localStorage.removeItem('tap_user'); set({ token: null, user: null, codeSentTo: null }) },
}))

export function getAuthToken() {
  const local = typeof localStorage !== 'undefined' ? localStorage.getItem('tap_token') : null
  return local || getAuthTokenFromCookie()
}
export function getAuthTokenFromCookie() { return readCookie('tap_token') }

// Check if current user is admin
export function isAdmin(): boolean {
  const user = useAuth.getState().user
  return user?.role === 'admin'
}

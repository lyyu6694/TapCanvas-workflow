import React, { useState, useCallback } from 'react'
import { Button, Paper, Title, Text, Stack, TextInput, PinInput, Tooltip, Group, Loader } from '@mantine/core'
import { useAuth, type User } from './store'
import { toast } from '../ui/toast'
import WelcomeScreen from '../ui/WelcomeScreen'

export default function AuthGate({ children, className }: { children: React.ReactNode; className?: string }) {
  const token = useAuth(s => s.token)
  const user = useAuth(s => s.user)
  const loading = useAuth(s => s.loading)
  const codeSentTo = useAuth(s => s.codeSentTo)
  const sendCode = useAuth(s => s.sendCode)
  const verifyCode = useAuth(s => s.verifyCode)
  const loginAsGuest = useAuth(s => s.loginAsGuest)

  const [showWelcome, setShowWelcome] = useState(true)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [needsInvitation, setNeedsInvitation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guestLoading, setGuestLoading] = useState(false)

  const handleWelcomeComplete = useCallback(() => {
    setShowWelcome(false)
  }, [])

  const handleSendCode = useCallback(async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('请输入有效的邮箱地址')
      return
    }
    setError(null)
    const result = await sendCode(email.trim())
    if (!result.success) {
      setError(result.error || '发送验证码失败')
    }
  }, [email, sendCode])

  const handleVerify = useCallback(async () => {
    if (!code || code.length !== 6) {
      setError('请输入6位验证码')
      return
    }
    setError(null)
    const result = await verifyCode(codeSentTo || email, code, invitationCode || undefined)
    if (!result.success) {
      if (result.error?.includes('邀请码')) {
        setNeedsInvitation(true)
      }
      setError(result.error || '验证失败')
    }
  }, [code, codeSentTo, email, invitationCode, verifyCode])

  const handleGuestLogin = useCallback(async () => {
    if (guestLoading) return
    setGuestLoading(true)
    try {
      await loginAsGuest()
    } catch (err: any) {
      toast('游客模式登录失败，请稍后再试', 'error')
    } finally {
      setGuestLoading(false)
    }
  }, [guestLoading, loginAsGuest])

  const handleResendCode = useCallback(() => {
    setCode('')
    handleSendCode()
  }, [handleSendCode])

  const gateClassName = ['auth-gate', className].filter(Boolean).join(' ')

  // Show welcome animation first
  if (showWelcome && !token) {
    return <WelcomeScreen onComplete={handleWelcomeComplete} />
  }

  // Authenticated - render children
  if (token) {
    return (
      <div className={gateClassName} style={{ height: '100%', width: '100%' }}>
        {children}
      </div>
    )
  }

  // Login UI
  return (
    <div
      className={gateClassName}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#09090b',
      }}
    >
      <Paper
        className="auth-gate-card"
        withBorder
        shadow="md"
        p="xl"
        radius="md"
        style={{
          width: 400,
          textAlign: 'center',
          backgroundColor: 'rgba(15, 15, 18, 0.95)',
          borderColor: 'rgba(255, 255, 255, 0.08)',
        }}
      >
        <Title className="auth-gate-title" order={3} mb="sm" style={{ color: '#fff' }}>
          登录 TapCanvas
        </Title>
        <Text className="auth-gate-subtitle" c="dimmed" size="sm" mb="lg">
          使用邮箱验证码登录
        </Text>

        <Stack gap="md">
          {/* Email input */}
          {!codeSentTo && (
            <>
              <TextInput
                className="auth-gate-email"
                placeholder="请输入邮箱地址"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                disabled={loading}
                onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                styles={{
                  input: {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    '&::placeholder': { color: 'rgba(255, 255, 255, 0.4)' },
                  },
                }}
              />
              <Button
                className="auth-gate-send"
                onClick={handleSendCode}
                loading={loading}
                fullWidth
              >
                发送验证码
              </Button>
            </>
          )}

          {/* Verification code input */}
          {codeSentTo && (
            <>
              <Text size="sm" c="dimmed">
                验证码已发送至 <strong style={{ color: '#fff' }}>{codeSentTo}</strong>
              </Text>
              <Group justify="center">
                <PinInput
                  className="auth-gate-code"
                  length={6}
                  value={code}
                  onChange={setCode}
                  disabled={loading}
                  type="number"
                  styles={{
                    input: {
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderColor: 'rgba(255, 255, 255, 0.1)',
                      color: '#fff',
                    },
                  }}
                />
              </Group>

              {/* Invitation code input (for new users) */}
              {needsInvitation && (
                <TextInput
                  className="auth-gate-invitation"
                  placeholder="请输入邀请码（新用户必填）"
                  value={invitationCode}
                  onChange={(e) => setInvitationCode(e.currentTarget.value)}
                  disabled={loading}
                  styles={{
                    input: {
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderColor: 'rgba(255, 255, 255, 0.1)',
                      color: '#fff',
                      '&::placeholder': { color: 'rgba(255, 255, 255, 0.4)' },
                    },
                  }}
                />
              )}

              <Group gap="sm">
                <Button
                  className="auth-gate-verify"
                  onClick={handleVerify}
                  loading={loading}
                  style={{ flex: 1 }}
                >
                  验证登录
                </Button>
                <Button
                  className="auth-gate-resend"
                  variant="subtle"
                  onClick={handleResendCode}
                  disabled={loading}
                >
                  重新发送
                </Button>
              </Group>
            </>
          )}

          {/* Error message */}
          {error && (
            <Text size="sm" c="red" ta="center">
              {error}
            </Text>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', margin: '8px 0' }} />

          {/* Guest login */}
          <Button
            className="auth-gate-guest"
            variant="outline"
            loading={guestLoading}
            onClick={handleGuestLogin}
            fullWidth
            styles={{
              root: {
                borderColor: 'rgba(255, 255, 255, 0.15)',
                color: 'rgba(255, 255, 255, 0.7)',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                },
              },
            }}
          >
            游客模式体验
          </Button>
          <Text size="xs" c="dimmed">
            游客数据仅保存在当前浏览器，不会同步到服务器。
          </Text>
        </Stack>
      </Paper>
    </div>
  )
}

import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Button, Stack, Text, TextInput, Group, Paper, Badge, CopyButton, ActionIcon, Tooltip, Loader, NumberInput } from '@mantine/core'
import { IconCopy, IconCheck, IconPlus, IconRefresh } from '@tabler/icons-react'
import { generateInvitationCode, listInvitationCodes, type InvitationCodeDto } from '../api/server'
import { useAuth, isAdmin } from '../auth/store'
import { toast } from './toast'

export default function InvitationConsole({ opened, onClose }: { opened: boolean; onClose: () => void }) {
    const user = useAuth(s => s.user)
    const [codes, setCodes] = useState<InvitationCodeDto[]>([])
    const [loading, setLoading] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [expiresInDays, setExpiresInDays] = useState<number | undefined>(undefined)
    const [error, setError] = useState<string | null>(null)

    const userIsAdmin = isAdmin()

    const loadCodes = useCallback(async () => {
        if (!userIsAdmin) return
        setLoading(true)
        setError(null)
        try {
            const result = await listInvitationCodes()
            if (result.success && result.codes) {
                setCodes(result.codes)
            } else {
                setError(result.error || '加载邀请码失败')
            }
        } catch (err: any) {
            setError(err?.message || '加载失败')
        } finally {
            setLoading(false)
        }
    }, [userIsAdmin])

    useEffect(() => {
        if (opened && userIsAdmin) {
            loadCodes()
        }
    }, [opened, userIsAdmin, loadCodes])

    const handleGenerate = useCallback(async () => {
        if (generating) return
        setGenerating(true)
        try {
            const result = await generateInvitationCode(expiresInDays)
            if (result.success && result.code) {
                toast(`邀请码已生成: ${result.code}`, 'success')
                loadCodes()
            } else {
                toast(result.error || '生成失败', 'error')
            }
        } catch (err: any) {
            toast(err?.message || '生成失败', 'error')
        } finally {
            setGenerating(false)
        }
    }, [generating, expiresInDays, loadCodes])

    if (!userIsAdmin) {
        return (
            <Modal opened={opened} onClose={onClose} title="邀请码管理" size="md">
                <Text c="dimmed">您没有权限管理邀请码</Text>
            </Modal>
        )
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="邀请码管理"
            size="lg"
            styles={{
                content: {
                    backgroundColor: '#09090b',
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                },
                header: {
                    backgroundColor: '#09090b',
                },
                title: {
                    color: '#fff',
                    fontWeight: 600,
                },
            }}
        >
            <Stack gap="md">
                {/* Generate new code */}
                <Paper
                    p="md"
                    radius="md"
                    style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                >
                    <Text size="sm" fw={500} mb="sm" style={{ color: '#fff' }}>
                        生成新邀请码
                    </Text>
                    <Group gap="sm">
                        <NumberInput
                            placeholder="有效期（天）留空为无限"
                            value={expiresInDays}
                            onChange={(val) => setExpiresInDays(typeof val === 'number' ? val : undefined)}
                            min={1}
                            max={365}
                            style={{ flex: 1 }}
                            styles={{
                                input: {
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    borderColor: 'rgba(255, 255, 255, 0.1)',
                                    color: '#fff',
                                },
                            }}
                        />
                        <Button
                            leftSection={<IconPlus size={16} />}
                            onClick={handleGenerate}
                            loading={generating}
                        >
                            生成
                        </Button>
                    </Group>
                </Paper>

                {/* Codes list */}
                <Group justify="space-between" mb="xs">
                    <Text size="sm" fw={500} style={{ color: '#fff' }}>
                        已生成的邀请码 ({codes.length})
                    </Text>
                    <ActionIcon variant="subtle" onClick={loadCodes} disabled={loading}>
                        <IconRefresh size={16} />
                    </ActionIcon>
                </Group>

                {loading ? (
                    <Group justify="center" p="lg">
                        <Loader size="sm" />
                    </Group>
                ) : error ? (
                    <Text c="red" size="sm">{error}</Text>
                ) : codes.length === 0 ? (
                    <Text c="dimmed" size="sm" ta="center">暂无邀请码</Text>
                ) : (
                    <Stack gap="xs">
                        {codes.map((code) => (
                            <Paper
                                key={code.id}
                                p="sm"
                                radius="md"
                                style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                }}
                            >
                                <Group justify="space-between">
                                    <Group gap="sm">
                                        <Text
                                            size="sm"
                                            ff="monospace"
                                            style={{
                                                color: code.isUsed ? 'rgba(255, 255, 255, 0.4)' : '#fff',
                                                textDecoration: code.isUsed ? 'line-through' : 'none',
                                            }}
                                        >
                                            {code.code}
                                        </Text>
                                        {code.isUsed ? (
                                            <Badge size="xs" color="gray" variant="light">已使用</Badge>
                                        ) : code.expiresAt && new Date(code.expiresAt) < new Date() ? (
                                            <Badge size="xs" color="red" variant="light">已过期</Badge>
                                        ) : (
                                            <Badge size="xs" color="green" variant="light">可用</Badge>
                                        )}
                                    </Group>
                                    <Group gap="xs">
                                        {code.usedByEmail && (
                                            <Text size="xs" c="dimmed">{code.usedByEmail}</Text>
                                        )}
                                        <CopyButton value={code.code}>
                                            {({ copied, copy }) => (
                                                <Tooltip label={copied ? '已复制' : '复制'}>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        onClick={copy}
                                                        disabled={code.isUsed}
                                                        size="sm"
                                                    >
                                                        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                        </CopyButton>
                                    </Group>
                                </Group>
                                {code.expiresAt && !code.isUsed && (
                                    <Text size="xs" c="dimmed" mt={4}>
                                        有效期至: {new Date(code.expiresAt).toLocaleDateString()}
                                    </Text>
                                )}
                            </Paper>
                        ))}
                    </Stack>
                )}
            </Stack>
        </Modal>
    )
}

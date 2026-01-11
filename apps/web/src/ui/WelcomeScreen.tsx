import React, { useEffect, useRef, useState, useCallback } from 'react'

// Slogans for random display
const SLOGANS = [
    'AI 创作，无限可能',
    '零 GPU，全场景视频生成',
    '用自然语言，构建工作流',
    '从文字到视频，一键转化',
    '沉浸式创作，释放灵感',
    'Sora + Veo，双引擎驱动',
    '让每个人都能成为创作者',
    '工作流画布，可视化编排',
]

type Phase = 'breathing' | 'loading' | 'slogan' | 'done'

export default function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [phase, setPhase] = useState<Phase>('breathing')
    const [loadingText, setLoadingText] = useState('')
    const [slogan, setSlogan] = useState('')
    const [opacity, setOpacity] = useState(1)
    const animationRef = useRef<number>(0)

    // Breathing dot grid animation
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        const resize = () => {
            canvas.width = window.innerWidth * dpr
            canvas.height = window.innerHeight * dpr
            canvas.style.width = `${window.innerWidth}px`
            canvas.style.height = `${window.innerHeight}px`
            ctx.scale(dpr, dpr)
        }
        resize()
        window.addEventListener('resize', resize)

        const dotSpacing = 40
        const baseDotRadius = 1.5
        let startTime = Date.now()

        const animate = () => {
            const w = window.innerWidth
            const h = window.innerHeight
            const elapsed = (Date.now() - startTime) / 1000

            ctx.clearRect(0, 0, w, h)

            // Calculate grid
            const cols = Math.ceil(w / dotSpacing) + 1
            const rows = Math.ceil(h / dotSpacing) + 1
            const offsetX = (w - (cols - 1) * dotSpacing) / 2
            const offsetY = (h - (rows - 1) * dotSpacing) / 2

            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const x = offsetX + col * dotSpacing
                    const y = offsetY + row * dotSpacing

                    // Breathing effect: sine wave based on time and position
                    const wave = Math.sin(elapsed * 1.5 + (col + row) * 0.15) * 0.5 + 0.5
                    const scale = 0.6 + wave * 0.8
                    const alpha = 0.15 + wave * 0.25

                    ctx.beginPath()
                    ctx.arc(x, y, baseDotRadius * scale, 0, Math.PI * 2)
                    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
                    ctx.fill()
                }
            }

            animationRef.current = requestAnimationFrame(animate)
        }

        animate()

        return () => {
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationRef.current)
        }
    }, [])

    // Phase transitions
    useEffect(() => {
        const timers: NodeJS.Timeout[] = []

        // Breathing phase: 1.5s
        timers.push(setTimeout(() => setPhase('loading'), 1500))

        // Loading phase: animate "LOADING" text with gather-flicker
        timers.push(setTimeout(() => {
            const chars = 'LOADING'
            let index = 0
            const interval = setInterval(() => {
                if (index <= chars.length) {
                    setLoadingText(chars.slice(0, index))
                    index++
                } else {
                    clearInterval(interval)
                    // Flicker effect
                    let flickers = 0
                    const flickerInterval = setInterval(() => {
                        setLoadingText(prev => prev === chars ? '' : chars)
                        flickers++
                        if (flickers >= 4) {
                            clearInterval(flickerInterval)
                            setLoadingText(chars)
                            setPhase('slogan')
                        }
                    }, 150)
                }
            }, 120)
        }, 1500))

        // Slogan phase: show random slogan
        timers.push(setTimeout(() => {
            setSlogan(SLOGANS[Math.floor(Math.random() * SLOGANS.length)])
        }, 3500))

        // Complete transition
        timers.push(setTimeout(() => {
            setPhase('done')
            setOpacity(0)
        }, 5000))

        timers.push(setTimeout(() => {
            onComplete()
        }, 5500))

        return () => timers.forEach(clearTimeout)
    }, [onComplete])

    return (
        <div
            className="welcome-screen"
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: '#09090b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                zIndex: 9999,
                opacity,
                transition: 'opacity 0.5s ease-out',
                pointerEvents: phase === 'done' ? 'none' : 'auto',
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 0,
                }}
            />

            <div
                style={{
                    position: 'relative',
                    zIndex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 24,
                }}
            >
                {/* LOADING text with gather-flicker effect */}
                {(phase === 'loading' || phase === 'slogan' || phase === 'done') && (
                    <div
                        className="loading-text"
                        style={{
                            fontSize: 48,
                            fontWeight: 700,
                            letterSpacing: 16,
                            color: '#fff',
                            opacity: phase === 'slogan' || phase === 'done' ? 0.3 : 1,
                            transition: 'opacity 0.3s ease',
                            fontFamily: 'Inter, system-ui, sans-serif',
                        }}
                    >
                        {loadingText}
                    </div>
                )}

                {/* Slogan */}
                {(phase === 'slogan' || phase === 'done') && slogan && (
                    <div
                        className="slogan-text"
                        style={{
                            fontSize: 20,
                            color: 'rgba(255, 255, 255, 0.8)',
                            fontWeight: 500,
                            opacity: phase === 'done' ? 0 : 1,
                            transition: 'opacity 0.3s ease',
                            fontFamily: 'Inter, system-ui, sans-serif',
                        }}
                    >
                        {slogan}
                    </div>
                )}
            </div>
        </div>
    )
}

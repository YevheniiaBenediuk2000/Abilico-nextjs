'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'

export const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function AuthPage() {
    const router = useRouter()
    const [pendingMFA, setPendingMFA] = useState(null)
    const [totpCode, setTotpCode] = useState('')

    useEffect(() => {
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN') {
                // check if this user has verified TOTP
                const { data: factors } = await supabase.auth.mfa.listFactors()
                const totp = factors?.all?.find(
                    (f) => f.factor_type === 'totp' && f.status === 'verified'
                )

                if (totp) {
                    // ✅ create challenge (still signed in)
                    const { data: challenge, error } = await supabase.auth.mfa.challenge({
                        factorId: totp.id,
                    })
                    if (error) {
                        console.error('Challenge failed:', error)
                        router.push('/dashboard')
                        return
                    }

                    // show the 2FA input UI
                    setPendingMFA({ factorId: totp.id, challengeId: challenge.id })
                } else {
                    // user has no MFA — normal login
                    router.push('/dashboard')
                }
            }
        })

        return () => subscription.unsubscribe()
    }, [router])

    const handleVerify = async () => {
        if (!pendingMFA) return

        const { error } = await supabase.auth.mfa.verify({
            factorId: pendingMFA.factorId,
            challengeId: pendingMFA.challengeId,
            code: totpCode,
        })

        if (error) {
            console.error('Verify failed:', error)
            alert('❌ Wrong code')
        } else {
            alert('✅ 2FA verified!')
            router.push('/dashboard')
        }
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginTop: '10vh',
            }}
        >
            {!pendingMFA ? (
                <Auth
                    supabaseClient={supabase}
                    appearance={{ theme: ThemeSupa }}
                    providers={['google']}
                />
            ) : (
                <div className="card p-3" style={{ maxWidth: 400 }}>
                    <h5>Two-Factor Authentication</h5>
                    <p>Enter the 6-digit code from your Authenticator app:</p>
                    <input
                        type="text"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        className="form-control my-2"
                        placeholder="123456"
                    />
                    <button onClick={handleVerify} className="btn btn-success w-100">
                        Verify
                    </button>
                </div>
            )}
        </div>
    )
}
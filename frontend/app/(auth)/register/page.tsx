'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Register Page — Premium signup UI with password strength indicator
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff, FiArrowRight, FiCheck } from 'react-icons/fi';
import { RiRobot2Line, RiGoogleLine, RiGithubLine } from 'react-icons/ri';
import { useAuthStore } from '@/stores/authStore';
import { fadeInUp } from '@/lib/motion';

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: 'var(--accent-error)' };
  if (score <= 2) return { score, label: 'Fair', color: 'var(--accent-warning)' };
  if (score <= 3) return { score, label: 'Good', color: 'var(--accent-info)' };
  return { score, label: 'Strong', color: 'var(--accent-success)' };
}

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await register({ email, username, password });
      router.push('/');
    } catch {
      // Error is set in store
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      background: 'var(--bg-primary)',
    }}>
      {/* Left: Branding */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #4f46e5 100%)',
        backgroundSize: '200% 200%',
        animation: 'gradient-shift 8s ease infinite',
        padding: 48,
        position: 'relative',
        overflow: 'hidden',
      }}
        className="hidden-mobile"
      >
        <div style={{
          position: 'absolute',
          width: 250,
          height: 250,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          bottom: -40,
          right: -40,
        }} />
        <div style={{
          position: 'absolute',
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)',
          top: 60,
          left: -30,
        }} />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ textAlign: 'center', position: 'relative', zIndex: 1, color: 'white' }}
        >
          <div style={{
            width: 72,
            height: 72,
            borderRadius: 'var(--radius-xl)',
            background: 'rgba(255,255,255,0.2)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: 32,
          }}>
            <RiRobot2Line />
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 12 }}>Join CleverChat</h1>
          <p style={{ fontSize: 18, opacity: 0.9, maxWidth: 360, lineHeight: 1.6 }}>
            Start chatting with AI models, create content, and boost your productivity
          </p>

          <div style={{ marginTop: 40, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {['Multi-model AI support', 'Conversation branching & history', 'File & image analysis', 'Export & share conversations'].map((feature) => (
              <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, opacity: 0.9 }}>
                <FiCheck size={16} style={{ color: 'rgba(255,255,255,0.8)' }} />
                {feature}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right: Form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
      }}>
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          style={{ width: '100%', maxWidth: 420 }}
        >
          <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 4 }}>
            Create your account
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 32 }}>
            Get started for free — no credit card required
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding: '12px 16px',
                background: 'var(--accent-error-soft)',
                color: 'var(--accent-error)',
                borderRadius: 'var(--radius-md)',
                fontSize: 14,
                marginBottom: 20,
                border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Username */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <FiUser size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')); clearError(); }}
                  placeholder="johndoe"
                  required
                  minLength={3}
                  className="input-field"
                  style={{ paddingLeft: 38 }}
                />
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
                Email address
              </label>
              <div style={{ position: 'relative' }}>
                <FiMail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError(); }}
                  placeholder="you@example.com"
                  required
                  className="input-field"
                  style={{ paddingLeft: 38 }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <FiLock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  className="input-field"
                  style={{ paddingLeft: 38, paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: 0,
                    display: 'flex',
                  }}
                >
                  {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
            </div>

            {/* Password strength */}
            {password && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{ marginBottom: 20 }}
              >
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: 3,
                        borderRadius: 'var(--radius-pill)',
                        background: i <= strength.score ? strength.color : 'var(--border-default)',
                        transition: 'all var(--transition-fast)',
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: strength.color, fontWeight: 500 }}>
                  {strength.label}
                </span>
              </motion.div>
            )}

            {!password && <div style={{ height: 20 }} />}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || password.length < 8}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', fontSize: 15, padding: '12px 24px' }}
            >
              {isLoading ? (
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  animation: 'spin-slow 0.6s linear infinite',
                }} />
              ) : (
                <>
                  Create Account
                  <FiArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }}>
              <RiGoogleLine size={18} />
              Google
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }}>
              <RiGithubLine size={18} />
              GitHub
            </button>
          </div>

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-secondary)' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'var(--accent-primary)', fontWeight: 600, textDecoration: 'none' }}>
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

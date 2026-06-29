'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Login Page — Premium auth UI with animated gradient background
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight } from 'react-icons/fi';
import { RiRobot2Line, RiGoogleLine, RiGithubLine } from 'react-icons/ri';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/components/Toast';
import { fadeInUp } from '@/lib/motion';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error: storeError, clearError } = useAuthStore();
  const { success, error } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login({ email, password });
      success('Logged in successfully!', 'Welcome back');
      router.push('/');
    } catch (err: any) {
      error(err?.message || 'Invalid email or password', 'Login Failed');
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      background: 'var(--bg-primary)',
    }}>
      {/* Left: Branding panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 50%, #10b981 100%)',
        backgroundSize: '200% 200%',
        animation: 'gradient-shift 8s ease infinite',
        padding: 48,
        position: 'relative',
        overflow: 'hidden',
      }}
        className="hidden-mobile"
      >
        {/* Decorative circles */}
        <div style={{
          position: 'absolute',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          top: -60,
          right: -60,
        }} />
        <div style={{
          position: 'absolute',
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)',
          bottom: 80,
          left: -40,
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
          <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 12 }}>CleverChat</h1>
          <p style={{ fontSize: 18, opacity: 0.9, maxWidth: 360, lineHeight: 1.6 }}>
            Your intelligent AI assistant powered by the latest language models
          </p>
        </motion.div>
      </div>

      {/* Right: Login form */}
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
          {/* Mobile logo */}
          <div style={{
            display: 'none',
            alignItems: 'center',
            gap: 10,
            marginBottom: 32,
            justifyContent: 'center',
          }}
            className="show-mobile"
          >
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 20,
            }}>
              <RiRobot2Line />
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-heading)' }}>CleverChat</span>
          </div>

          <h2 style={{
            fontSize: 26,
            fontWeight: 700,
            color: 'var(--text-heading)',
            marginBottom: 4,
          }}>
            Welcome back
          </h2>
          <p style={{
            fontSize: 15,
            color: 'var(--text-secondary)',
            marginBottom: 32,
          }}>
            Sign in to continue to your AI workspace
          </p>

          <form onSubmit={handleSubmit}>
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
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                  Password
                </label>
                <a href="#" style={{ fontSize: 13, color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}>
                  Forgot?
                </a>
              </div>
              <div style={{ position: 'relative' }}>
                <FiLock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  placeholder="Enter your password"
                  required
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

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
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
                  Sign In
                  <FiArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            margin: '24px 0',
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
          </div>

          {/* OAuth buttons */}
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

          {/* Sign up link */}
          <p style={{
            textAlign: 'center',
            marginTop: 24,
            fontSize: 14,
            color: 'var(--text-secondary)',
          }}>
            Don&apos;t have an account?{' '}
            <Link href="/register" style={{ color: 'var(--accent-primary)', fontWeight: 600, textDecoration: 'none' }}>
              Sign up
            </Link>
          </p>
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: flex !important; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { FiUser, FiMail, FiLock, FiCamera } from 'react-icons/fi';
import { useAuthStore } from '@/stores/authStore';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');

  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 4 }}>Profile</h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
        Manage your personal information and account settings
      </p>

      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--accent-primary-soft)',
          color: 'var(--accent-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          fontWeight: 600,
          position: 'relative',
        }}>
          {user?.username?.charAt(0).toUpperCase() || 'U'}
          <button style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--bg-card)',
            border: '2px solid var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <FiCamera size={12} />
          </button>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-heading)' }}>{user?.username}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {user?.role === 'admin' ? '👑 Administrator' : '👤 Member'}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 20 }}>
          Personal Information
        </h3>

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <button className="btn btn-primary" style={{ marginTop: 20 }}>
          Save Changes
        </button>
      </div>

      {/* Password */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 20 }}>
          Change Password
        </h3>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
              Current Password
            </label>
            <input type="password" className="input-field" placeholder="Enter current password" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
              New Password
            </label>
            <input type="password" className="input-field" placeholder="Enter new password" />
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 20 }}>
          Update Password
        </button>
      </div>
    </>
  );
}

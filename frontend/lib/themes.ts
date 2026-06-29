// Tailwind CSS color palettes mapping definitions for custom theme preferences.
// Matches: Slate, Gray, Zinc, Neutral, Stone, Red, Orange, Amber, Yellow, Lime, Green, Emerald, Indigo.
// Format is [colorName]: { light: { varName: value }, dark: { varName: value } }

export interface ThemeVariables {
  '--accent-primary': string;
  '--accent-primary-hover': string;
  '--accent-primary-soft': string;
  '--accent-primary-glow': string;
  '--border-accent': string;
  '--border-input-focus': string;
  '--text-accent': string;
  '--bg-primary'?: string;
  '--bg-secondary'?: string;
  '--bg-sidebar'?: string;
  '--text-primary'?: string;
  '--text-heading'?: string;
}

export type ColorThemeName =
  | 'slate'
  | 'gray'
  | 'zinc'
  | 'neutral'
  | 'stone'
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'indigo'
  | 'anvix';

export const colorThemes: Record<ColorThemeName, { light: ThemeVariables; dark: ThemeVariables }> = {
  slate: {
    light: {
      '--accent-primary': '#64748b',
      '--accent-primary-hover': '#475569',
      '--accent-primary-soft': '#f1f5f9',
      '--accent-primary-glow': 'rgba(100, 116, 139, 0.12)',
      '--border-accent': 'rgba(100, 116, 139, 0.3)',
      '--border-input-focus': '#64748b',
      '--text-accent': '#64748b',
    },
    dark: {
      '--accent-primary': '#94a3b8',
      '--accent-primary-hover': '#cbd5e1',
      '--accent-primary-soft': '#1e293b',
      '--accent-primary-glow': 'rgba(148, 163, 184, 0.15)',
      '--border-accent': 'rgba(148, 163, 184, 0.3)',
      '--border-input-focus': '#94a3b8',
      '--text-accent': '#94a3b8',
    },
  },
  gray: {
    light: {
      '--accent-primary': '#6b7280',
      '--accent-primary-hover': '#4b5563',
      '--accent-primary-soft': '#f3f4f6',
      '--accent-primary-glow': 'rgba(107, 115, 128, 0.12)',
      '--border-accent': 'rgba(107, 115, 128, 0.3)',
      '--border-input-focus': '#6b7280',
      '--text-accent': '#6b7280',
    },
    dark: {
      '--accent-primary': '#9ca3af',
      '--accent-primary-hover': '#d1d5db',
      '--accent-primary-soft': '#1f2937',
      '--accent-primary-glow': 'rgba(156, 163, 175, 0.15)',
      '--border-accent': 'rgba(156, 163, 175, 0.3)',
      '--border-input-focus': '#9ca3af',
      '--text-accent': '#9ca3af',
    },
  },
  zinc: {
    light: {
      '--accent-primary': '#71717a',
      '--accent-primary-hover': '#52525b',
      '--accent-primary-soft': '#f4f4f5',
      '--accent-primary-glow': 'rgba(113, 113, 122, 0.12)',
      '--border-accent': 'rgba(113, 113, 122, 0.3)',
      '--border-input-focus': '#71717a',
      '--text-accent': '#71717a',
    },
    dark: {
      '--accent-primary': '#a1a1aa',
      '--accent-primary-hover': '#d4d4d8',
      '--accent-primary-soft': '#27272a',
      '--accent-primary-glow': 'rgba(161, 161, 170, 0.15)',
      '--border-accent': 'rgba(161, 161, 170, 0.3)',
      '--border-input-focus': '#a1a1aa',
      '--text-accent': '#a1a1aa',
    },
  },
  neutral: {
    light: {
      '--accent-primary': '#737373',
      '--accent-primary-hover': '#525252',
      '--accent-primary-soft': '#f5f5f5',
      '--accent-primary-glow': 'rgba(115, 115, 115, 0.12)',
      '--border-accent': 'rgba(115, 115, 115, 0.3)',
      '--border-input-focus': '#737373',
      '--text-accent': '#737373',
    },
    dark: {
      '--accent-primary': '#a3a3a3',
      '--accent-primary-hover': '#d4d4d4',
      '--accent-primary-soft': '#262626',
      '--accent-primary-glow': 'rgba(163, 163, 163, 0.15)',
      '--border-accent': 'rgba(163, 163, 163, 0.3)',
      '--border-input-focus': '#a3a3a3',
      '--text-accent': '#a3a3a3',
    },
  },
  stone: {
    light: {
      '--accent-primary': '#78716c',
      '--accent-primary-hover': '#57534e',
      '--accent-primary-soft': '#f5f5f4',
      '--accent-primary-glow': 'rgba(120, 113, 108, 0.12)',
      '--border-accent': 'rgba(120, 113, 108, 0.3)',
      '--border-input-focus': '#78716c',
      '--text-accent': '#78716c',
    },
    dark: {
      '--accent-primary': '#a8a29e',
      '--accent-primary-hover': '#d6d3d1',
      '--accent-primary-soft': '#292524',
      '--accent-primary-glow': 'rgba(168, 162, 158, 0.15)',
      '--border-accent': 'rgba(168, 162, 158, 0.3)',
      '--border-input-focus': '#a8a29e',
      '--text-accent': '#a8a29e',
    },
  },
  red: {
    light: {
      '--accent-primary': '#ef4444',
      '--accent-primary-hover': '#dc2626',
      '--accent-primary-soft': '#fef2f2',
      '--accent-primary-glow': 'rgba(239, 68, 68, 0.12)',
      '--border-accent': 'rgba(239, 68, 68, 0.3)',
      '--border-input-focus': '#ef4444',
      '--text-accent': '#ef4444',
    },
    dark: {
      '--accent-primary': '#f87171',
      '--accent-primary-hover': '#fca5a5',
      '--accent-primary-soft': '#7f1d1d',
      '--accent-primary-glow': 'rgba(248, 113, 113, 0.15)',
      '--border-accent': 'rgba(248, 113, 113, 0.3)',
      '--border-input-focus': '#f87171',
      '--text-accent': '#f87171',
    },
  },
  orange: {
    light: {
      '--accent-primary': '#f97316',
      '--accent-primary-hover': '#ea580c',
      '--accent-primary-soft': '#fff7ed',
      '--accent-primary-glow': 'rgba(249, 115, 22, 0.12)',
      '--border-accent': 'rgba(249, 115, 22, 0.3)',
      '--border-input-focus': '#f97316',
      '--text-accent': '#f97316',
    },
    dark: {
      '--accent-primary': '#fb923c',
      '--accent-primary-hover': '#fdba74',
      '--accent-primary-soft': '#7c2d12',
      '--accent-primary-glow': 'rgba(251, 146, 60, 0.15)',
      '--border-accent': 'rgba(251, 146, 60, 0.3)',
      '--border-input-focus': '#fb923c',
      '--text-accent': '#fb923c',
    },
  },
  amber: {
    light: {
      '--accent-primary': '#f59e0b',
      '--accent-primary-hover': '#d97706',
      '--accent-primary-soft': '#fffbeb',
      '--accent-primary-glow': 'rgba(245, 158, 11, 0.12)',
      '--border-accent': 'rgba(245, 158, 11, 0.3)',
      '--border-input-focus': '#f59e0b',
      '--text-accent': '#f59e0b',
    },
    dark: {
      '--accent-primary': '#fbbf24',
      '--accent-primary-hover': '#fcd34d',
      '--accent-primary-soft': '#78350f',
      '--accent-primary-glow': 'rgba(251, 191, 36, 0.15)',
      '--border-accent': 'rgba(251, 191, 36, 0.3)',
      '--border-input-focus': '#fbbf24',
      '--text-accent': '#fbbf24',
    },
  },
  yellow: {
    light: {
      '--accent-primary': '#eab308',
      '--accent-primary-hover': '#ca8a04',
      '--accent-primary-soft': '#fefce8',
      '--accent-primary-glow': 'rgba(234, 179, 8, 0.12)',
      '--border-accent': 'rgba(234, 179, 8, 0.3)',
      '--border-input-focus': '#eab308',
      '--text-accent': '#eab308',
    },
    dark: {
      '--accent-primary': '#facc15',
      '--accent-primary-hover': '#fde047',
      '--accent-primary-soft': '#713f12',
      '--accent-primary-glow': 'rgba(250, 204, 21, 0.15)',
      '--border-accent': 'rgba(250, 204, 21, 0.3)',
      '--border-input-focus': '#facc15',
      '--text-accent': '#facc15',
    },
  },
  lime: {
    light: {
      '--accent-primary': '#84cc16',
      '--accent-primary-hover': '#65a30d',
      '--accent-primary-soft': '#f7fee7',
      '--accent-primary-glow': 'rgba(132, 204, 22, 0.12)',
      '--border-accent': 'rgba(132, 204, 22, 0.3)',
      '--border-input-focus': '#84cc16',
      '--text-accent': '#84cc16',
    },
    dark: {
      '--accent-primary': '#a3e635',
      '--accent-primary-hover': '#bef264',
      '--accent-primary-soft': '#365314',
      '--accent-primary-glow': 'rgba(163, 230, 53, 0.15)',
      '--border-accent': 'rgba(163, 230, 53, 0.3)',
      '--border-input-focus': '#a3e635',
      '--text-accent': '#a3e635',
    },
  },
  green: {
    light: {
      '--accent-primary': '#22c55e',
      '--accent-primary-hover': '#16a34a',
      '--accent-primary-soft': '#f0fdf4',
      '--accent-primary-glow': 'rgba(34, 197, 94, 0.12)',
      '--border-accent': 'rgba(34, 197, 94, 0.3)',
      '--border-input-focus': '#22c55e',
      '--text-accent': '#22c55e',
    },
    dark: {
      '--accent-primary': '#4ade80',
      '--accent-primary-hover': '#86efac',
      '--accent-primary-soft': '#14532d',
      '--accent-primary-glow': 'rgba(74, 222, 128, 0.15)',
      '--border-accent': 'rgba(74, 222, 128, 0.3)',
      '--border-input-focus': '#4ade80',
      '--text-accent': '#4ade80',
    },
  },
  emerald: {
    light: {
      '--accent-primary': '#10b981',
      '--accent-primary-hover': '#059669',
      '--accent-primary-soft': '#ecfdf5',
      '--accent-primary-glow': 'rgba(16, 185, 129, 0.12)',
      '--border-accent': 'rgba(16, 185, 129, 0.3)',
      '--border-input-focus': '#10b981',
      '--text-accent': '#10b981',
    },
    dark: {
      '--accent-primary': '#34d399',
      '--accent-primary-hover': '#6ee7b7',
      '--accent-primary-soft': '#064e3b',
      '--accent-primary-glow': 'rgba(52, 211, 153, 0.15)',
      '--border-accent': 'rgba(52, 211, 153, 0.3)',
      '--border-input-focus': '#34d399',
      '--text-accent': '#34d399',
    },
  },
  indigo: {
    light: {
      '--accent-primary': '#4f46e5',
      '--accent-primary-hover': '#4338ca',
      '--accent-primary-soft': '#eef2ff',
      '--accent-primary-glow': 'rgba(79, 70, 229, 0.12)',
      '--border-accent': 'rgba(79, 70, 229, 0.3)',
      '--border-input-focus': '#4f46e5',
      '--text-accent': '#4f46e5',
    },
    dark: {
      '--accent-primary': '#818cf8',
      '--accent-primary-hover': '#a5b4fc',
      '--accent-primary-soft': '#1e1b4b',
      '--accent-primary-glow': 'rgba(129, 140, 248, 0.15)',
      '--border-accent': 'rgba(129, 140, 248, 0.3)',
      '--border-input-focus': '#818cf8',
      '--text-accent': '#818cf8',
    },
  },
  anvix: {
    light: {
      '--accent-primary': '#e27243',
      '--accent-primary-hover': '#c9592b',
      '--accent-primary-soft': '#fdf6f0',
      '--accent-primary-glow': 'rgba(226, 114, 67, 0.15)',
      '--border-accent': 'rgba(226, 114, 67, 0.3)',
      '--border-input-focus': '#e27243',
      '--text-accent': '#e27243',
      '--bg-primary': '#fdfbfa',
      '--bg-secondary': '#f7f2eb',
      '--bg-sidebar': '#f0e9dd',
      '--text-primary': '#3b0d22',
      '--text-heading': '#300c1c',
    },
    dark: {
      '--accent-primary': '#f08b5f',
      '--accent-primary-hover': '#f5a782',
      '--accent-primary-soft': '#3d1a0d',
      '--accent-primary-glow': 'rgba(240, 139, 95, 0.18)',
      '--border-accent': 'rgba(240, 139, 95, 0.3)',
      '--border-input-focus': '#f08b5f',
      '--text-accent': '#f08b5f',
      '--bg-primary': '#1f0b14',
      '--bg-secondary': '#15050c',
      '--bg-sidebar': '#1a0810',
      '--text-primary': '#f8f1f4',
      '--text-heading': '#ffffff',
    },
  },
};

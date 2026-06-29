/* ═══════════════════════════════════════════════════════════════════════════
   Framer Motion Shared Variants
   GPU-accelerated animation presets for consistent micro-interactions
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Variants } from 'motion/react';

const easeDefault: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: easeDefault },
  },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

export const slideInFromRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30 },
  },
  exit: { opacity: 0, x: 24, transition: { duration: 0.2 } },
};

export const slideInFromLeft: Variants = {
  hidden: { opacity: 0, x: -24 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30 },
  },
  exit: { opacity: 0, x: -24, transition: { duration: 0.2 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  exit: { opacity: 0, scale: 0.94, transition: { duration: 0.15 } },
};

export const sidebarVariants: Variants = {
  open: {
    width: 280,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
  closed: {
    width: 0,
    opacity: 0,
    transition: { duration: 0.2 },
  },
};

export const messageAppear: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: easeDefault,
    },
  },
};

export const inputBarExpand: Variants = {
  collapsed: { height: 56 },
  expanded: {
    height: 120,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
};

export const dropdownVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: -4,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -4,
    transition: { duration: 0.1 },
  },
};

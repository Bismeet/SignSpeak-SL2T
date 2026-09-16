import type { Config } from 'tailwindcss';

/**
 * SignSpeak design tokens.
 *
 * Every colour is driven by a CSS custom property defined in `app/globals.css`, so the
 * light / dark / high-contrast themes are switched with a single `data-theme` attribute
 * on <html> instead of duplicating utility classes.
 *
 * Sizing follows `docs/ui-ux-specification.md` §1: base 18px, 48px minimum touch target,
 * 96px minimum in emergency mode.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--ss-bg) / <alpha-value>)',
        surface: 'rgb(var(--ss-surface) / <alpha-value>)',
        raised: 'rgb(var(--ss-raised) / <alpha-value>)',
        line: 'rgb(var(--ss-line) / <alpha-value>)',
        strong: 'rgb(var(--ss-line-strong) / <alpha-value>)',
        ink: 'rgb(var(--ss-ink) / <alpha-value>)',
        muted: 'rgb(var(--ss-ink-muted) / <alpha-value>)',
        faint: 'rgb(var(--ss-ink-faint) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--ss-primary) / <alpha-value>)',
          strong: 'rgb(var(--ss-primary-strong) / <alpha-value>)',
          soft: 'rgb(var(--ss-primary-soft) / <alpha-value>)',
          ink: 'rgb(var(--ss-primary-ink) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--ss-accent) / <alpha-value>)',
          soft: 'rgb(var(--ss-accent-soft) / <alpha-value>)',
          ink: 'rgb(var(--ss-accent-ink) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--ss-danger) / <alpha-value>)',
          strong: 'rgb(var(--ss-danger-strong) / <alpha-value>)',
          soft: 'rgb(var(--ss-danger-soft) / <alpha-value>)',
          ink: 'rgb(var(--ss-danger-ink) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--ss-success) / <alpha-value>)',
          soft: 'rgb(var(--ss-success-soft) / <alpha-value>)',
          ink: 'rgb(var(--ss-success-ink) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--ss-warning) / <alpha-value>)',
          soft: 'rgb(var(--ss-warning-soft) / <alpha-value>)',
          ink: 'rgb(var(--ss-warning-ink) / <alpha-value>)',
        },
        focus: 'rgb(var(--ss-focus) / <alpha-value>)',
      },
      fontSize: {
        // Root is 18px (see globals.css), so these rem values are ~18px-based.
        xs: ['0.75rem', { lineHeight: '1.5' }],
        sm: ['0.875rem', { lineHeight: '1.55' }],
        base: ['1rem', { lineHeight: '1.65' }],
        lg: ['1.125rem', { lineHeight: '1.6' }],
        xl: ['1.3rem', { lineHeight: '1.5' }],
        '2xl': ['1.55rem', { lineHeight: '1.35' }],
        '3xl': ['1.9rem', { lineHeight: '1.25' }],
        '4xl': ['2.4rem', { lineHeight: '1.15' }],
        '5xl': ['3.1rem', { lineHeight: '1.1' }],
        '6xl': ['3.9rem', { lineHeight: '1.05' }],
      },
      spacing: {
        touch: '3rem', // 48px minimum touch target
        emergency: '6rem', // 96px emergency target
      },
      minHeight: {
        touch: '3rem',
        emergency: '6rem',
      },
      minWidth: {
        touch: '3rem',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--ss-shadow) / 0.06), 0 8px 24px -12px rgb(var(--ss-shadow) / 0.18)',
        lift: '0 2px 4px rgb(var(--ss-shadow) / 0.08), 0 18px 40px -18px rgb(var(--ss-shadow) / 0.28)',
        focus: '0 0 0 3px rgb(var(--ss-focus) / 1)',
      },
      fontFamily: {
        sans: ['var(--ss-font-sans)'],
        display: ['var(--ss-font-display)'],
      },
      keyframes: {
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.92)', opacity: '0.85' },
          '70%': { transform: 'scale(1.35)', opacity: '0' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        'sound-wave': {
          '0%, 100%': { transform: 'scaleY(0.4)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 260ms cubic-bezier(0.2, 0.7, 0.3, 1) both',
        'fade-in': 'fade-in 200ms ease-out both',
        'pulse-ring': 'pulseRing 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'sound-wave': 'sound-wave 900ms ease-in-out infinite',
      },
      transitionTimingFunction: {
        emphasised: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;

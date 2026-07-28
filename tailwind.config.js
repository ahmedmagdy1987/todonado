/** @type {import('tailwindcss').Config} */
//
// Todonado design system — LOCKED tokens.
// Do not improvise other colors. Dark mode is the default.
//
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Core surfaces (mission-control dark)
        background: '#0A0D16',
        surface: '#0F172A', // panels
        'surface-2': '#1E293B', // raised / hover

        // Brand + accents
        brand: {
          DEFAULT: '#6C5CE7', // violet
          fg: '#F8FAFC',
        },
        accent: '#4EA8FF', // blue

        // Semantic
        success: '#22D3A6', // mint
        warning: '#F59E0B', // amber
        danger: '#F43F5E', // coral

        // Text
        'text-primary': '#F8FAFC',
        'text-muted': '#94A3B8',
      },
      fontFamily: {
        display: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem', // card radius standard
        '3xl': '1.5rem',
      },
      backgroundImage: {
        // violet -> blue brand gradient for primary CTAs / focus rings
        // (named *-gradient to avoid colliding with the `brand` color's bg-brand utility)
        'brand-gradient': 'linear-gradient(135deg, #6C5CE7 0%, #4EA8FF 100%)',
        'brand-gradient-soft':
          'linear-gradient(135deg, rgba(108,92,231,0.18) 0%, rgba(78,168,255,0.18) 100%)',
      },
      boxShadow: {
        // soft elevation for panels
        elevation: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)',
        'elevation-lg': '0 2px 4px rgba(0,0,0,0.45), 0 16px 48px rgba(0,0,0,0.45)',
        'brand-glow': '0 8px 30px rgba(108,92,231,0.35)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // Landing hero ambience. Transform + opacity ONLY so it composites on the
        // GPU and never triggers layout. Disabled by the global
        // prefers-reduced-motion rule in index.css.
        'glow-drift': {
          '0%, 100%': { opacity: '0.7', transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { opacity: '1', transform: 'translate3d(0, -2%, 0) scale(1.08)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'glow-drift': 'glow-drift 14s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

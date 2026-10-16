import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#12100E', 50: '#F7F6F4', 100: '#EDEBE7', 200: '#DBD7D0', 300: '#BDB6AA', 400: '#8E8779', 500: '#6B645A', 600: '#4F4A43', 700: '#38342F', 800: '#221F1C', 900: '#12100E', 950: '#0A0908' },
        clay: { DEFAULT: '#B4533A', 50: '#FBF3F0', 100: '#F6E4DE', 200: '#EDC7BC', 300: '#E0A090', 400: '#CF7561', 500: '#B4533A', 600: '#9A412C', 700: '#7C3423', 800: '#5E2A1D', 900: '#3F1E15' },
        teal: { DEFAULT: '#1F6F6B', 50: '#EFF7F6', 100: '#D6EBE9', 200: '#AED7D4', 300: '#7CBCB8', 400: '#4A9C98', 500: '#1F6F6B', 600: '#1A5C58', 700: '#144A47', 800: '#0E3735', 900: '#082523' },
        gold: { DEFAULT: '#B08430', 50: '#FBF6EA', 100: '#F5E9CC', 200: '#EAD39B', 300: '#DCB865', 400: '#C99F45', 500: '#B08430', 600: '#8E6924', 700: '#6B4F1A' },
        paper: { DEFAULT: '#FBFAF8', soft: '#F5F3EF', line: '#E7E3DC', deep: '#12100E' },
      },
      fontFamily: {
        display: ['ui-serif', 'Iowan Old Style', '"Palatino Linotype"', 'Palatino', 'Georgia', 'serif'],
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Inter', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', '"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(18,16,14,0.04), 0 1px 1px rgba(18,16,14,0.03)',
        lift: '0 8px 24px -8px rgba(18,16,14,0.16), 0 2px 6px -2px rgba(18,16,14,0.08)',
        pop: '0 16px 48px -12px rgba(18,16,14,0.28)',
        insetline: 'inset 0 -1px 0 0 rgba(18,16,14,0.06)',
      },
      borderRadius: { xl: '0.75rem', '2xl': '1rem', '3xl': '1.25rem' },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in': { from: { opacity: '0', transform: 'translateX(12px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'shimmer': { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out both',
        'rise': 'rise .22s cubic-bezier(.2,.7,.3,1) both',
        'slide-in': 'slide-in .22s cubic-bezier(.2,.7,.3,1) both',
        'scale-in': 'scale-in .16s cubic-bezier(.2,.7,.3,1) both',
      },
    },
  },
  plugins: [],
};
export default config;

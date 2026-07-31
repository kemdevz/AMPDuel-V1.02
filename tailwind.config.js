/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Deep teal-dark background scale (BloxyBattles theme)
        ink: {
          950: '#050f0e',
          900: '#0a1514',
          850: '#0f1a19', // primary panel (sidebar / banner / cards body)
          800: '#132220', // raised surface
          750: '#162827', // chat panel
          700: '#1a3030', // page background base
          650: '#213a39',
          600: '#2a4847', // elevated button / badge
          550: '#335555', // elevated button (teal tint)
        },
        // Brand teal / emerald accent (BloxyBattles primary)
        brand: {
          50: '#ecfbfa',
          200: '#5fd9d0',
          300: '#3acdc6',
          400: '#15c1bc',
          500: '#00b5b2', // primary accent (vibrant teal, from B-logo)
          600: '#009c99',
          700: '#008380',
          800: '#006a67',
          900: '#00514e',
        },
        // Gold for coins/currency accent
        gold: {
          300: '#fde68a',
          400: '#f6df51',
          500: '#f5c518',
          600: '#f0b90b',
          700: '#d99e00',
        },
        // Cyan for secondary highlights
        cyan: {
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
        },
      },
      boxShadow: {
        glow: '0 0 24px -2px rgba(0,181,178,0.65)',
        'glow-sm': '0 0 14px -2px rgba(0,181,178,0.55)',
        card: '0 10px 30px -12px rgba(0,0,0,0.8)',
        'inset-border': 'inset 0 0 0 1px rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'page-radial':
          'radial-gradient(1200px 600px at 70% -10%, rgba(0,181,178,0.1), transparent 60%), radial-gradient(900px 500px at 0% 100%, rgba(0,115,112,0.1), transparent 55%)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 6s linear infinite',
      },
    },
  },
  plugins: [],
}

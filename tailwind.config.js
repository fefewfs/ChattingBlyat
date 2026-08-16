/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0a0e14',
        'bg-secondary': '#0f141c',
        'bg-tertiary': '#161d28',
        'bg-card': '#121823',
        'border-subtle': '#1e2735',
        'border-default': '#2a3545',
        'text-primary': '#e8edf5',
        'text-secondary': '#9aa8bd',
        'text-muted': '#5f6e85',
        'accent': '#00d4ff',
        'accent-dim': '#0099cc',
        'success': '#00e676',
        'warning': '#ffb300',
        'error': '#ff5252',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

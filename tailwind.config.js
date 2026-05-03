/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#0A0B0F',
        primary: '#D4A84B',
        surface: '#121218',
        text: '#F0EBE0',
        muted: '#8A7D6B',
        lines: '#8B2439',
        accent: '#2D4A3E',
      },
    },
  },
  plugins: [],
}

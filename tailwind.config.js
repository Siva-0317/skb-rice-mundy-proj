/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brownDark: '#3F2A1A',
        cream: '#E9D9C4',
        gold: '#C8912A',
        bg: '#FAF6EF',
        panel: '#F2EBD9',
        border: '#E0D0B5',
        textDark: '#2E1F0E',
        textMuted: '#7A5C3A',
        debit: '#B94040',
        credit: '#5A7A3A',
        // Generic aliases mapped to original theme
        primary: '#3F2A1A',
        background: '#FAF6EF',
        accent: '#C8912A'
      },
      fontFamily: {
        sans: ['"DM Sans"', 'sans-serif'],
        display: ['Lora', 'serif']
      }
    },
  },
  plugins: [],
}

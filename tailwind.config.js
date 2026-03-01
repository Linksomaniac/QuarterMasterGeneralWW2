/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        axis: { DEFAULT: '#8B0000', light: '#CD5C5C', dark: '#4A0000' },
        allies: { DEFAULT: '#00008B', light: '#6495ED', dark: '#00004A' },
        germany: '#555555',
        uk: '#8B6914',
        japan: '#C41E3A',
        soviet: '#CC0000',
        italy: '#228B22',
        usa: '#2E5090',
        board: { bg: '#1A2E1A', land: '#8B9B6B', sea: '#4A8EC2', supply: '#DAA520', frame: '#D4C090' },
      },
      fontFamily: {
        display: ['"Cinzel"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

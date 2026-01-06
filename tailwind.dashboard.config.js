/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './dashboard/index.html',
    './dashboard/app.js',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0d1117',
        'bg-secondary': '#161b22',
        border: '#30363d',
        text: '#c9d1d9',
        'text-secondary': '#8b949e',
        primary: '#58a6ff',
        success: '#3fb950',
        warning: '#d29922',
        error: '#f85149',
      },
    },
  },
  plugins: [],
};

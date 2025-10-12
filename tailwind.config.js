/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class", // "class" permite alternar via classe dark
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

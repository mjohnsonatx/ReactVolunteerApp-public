/** @type {import('tailwindcss').Config} */

// The desktop dashboard re-skins the shared admin components by remapping the
// Tailwind color scales they already use. The web app keeps its own palette;
// only the desktop build picks these up. Hues are drawn from the trail itself:
// river-stone neutrals, pine and moss greens, clay, goldenrod, and creek water.
const linen = {
  50: '#faf8f4', 100: '#f4f0e8', 200: '#e8e1d5', 300: '#d6ccbb', 400: '#a89d8c',
  500: '#7d7264', 600: '#5d5449', 700: '#47403a', 800: '#2f2a26', 900: '#1e1b18', 950: '#141210',
};
const moss = {
  50: '#eef4ec', 100: '#dbe8d6', 200: '#b8d1b0', 300: '#8fb587', 400: '#659666',
  500: '#4a7c52', 600: '#3b6543', 700: '#2f5137', 800: '#24402c', 900: '#1a2f21', 950: '#0f1d15',
};
const sage = {
  50: '#eff6ea', 100: '#dcecd1', 200: '#bad9a6', 300: '#93c07a', 400: '#6fa456',
  500: '#558a3f', 600: '#447032', 700: '#375928', 800: '#2b4520', 900: '#1f3218', 950: '#121f0e',
};
const clay = {
  50: '#fbf1ec', 100: '#f6e0d4', 200: '#ecc2ac', 300: '#df9f7e', 400: '#cf7d56',
  500: '#c0613b', 600: '#a04e2e', 700: '#7f3f26', 800: '#61311f', 900: '#452418', 950: '#2b150d',
};
const goldenrod = {
  50: '#fbf5e6', 100: '#f6e9c6', 200: '#ecd48f', 300: '#dfbb5a', 400: '#cfa232',
  500: '#b8891f', 600: '#966e18', 700: '#745514', 800: '#574010', 900: '#3d2d0c', 950: '#261b07',
};
const creek = {
  50: '#edf3f6', 100: '#d8e5ec', 200: '#b3cbd8', 300: '#86aabf', 400: '#5f8aa4',
  500: '#47708a', 600: '#395b71', 700: '#2e4959', 800: '#243944', 900: '#1a2a33', 950: '#0f1a20',
};
const pine = {
  50: '#eef3ef', 100: '#d9e3dc', 200: '#b4c7ba', 300: '#87a591', 400: '#5f806a',
  500: '#46654f', 600: '#37503f', 700: '#2a3d31', 800: '#1f2e25', 900: '#16221b', 950: '#0c1410',
};
const brick = {
  50: '#fbeeec', 100: '#f7d9d5', 200: '#eeb3ab', 300: '#e08a7e', 400: '#cf6354',
  500: '#b94a3c', 600: '#9a3a2f', 700: '#7a2f27', 800: '#5c251f', 900: '#421b17', 950: '#2a100d',
};

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '../app/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gray: linen,
        teal: moss,
        emerald: sage,
        orange: clay,
        amber: goldenrod,
        cyan: creek,
        slate: pine,
        red: brick,
        // Named aliases for desktop-only components.
        linen, moss, sage, clay, goldenrod, creek, pine, brick,
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', '"Book Antiqua"', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(30, 27, 24, 0.06), 0 4px 16px -8px rgba(30, 27, 24, 0.12)',
      },
    },
  },
  plugins: [],
};

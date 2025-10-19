import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class', // Enable dark mode via class strategy
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: { 
    extend: {
      animation: {
        shimmer: 'shimmer 2s infinite linear',
        slideDown: 'slideDown 0.3s ease-out',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    } 
  },
  plugins: [],
};
export default config;

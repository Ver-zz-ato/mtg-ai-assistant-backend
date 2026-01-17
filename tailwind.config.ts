import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class', // Enable dark mode via class strategy
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: { 
    extend: {
      animation: {
        shimmer: 'shimmer 2s infinite linear',
        slideDown: 'slideDown 0.3s ease-out',
        chatGlow: 'chatGlow 7s ease-in-out infinite',
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
        chatGlow: {
          '0%, 100%': { 
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.1), 0 0 40px rgba(59, 130, 246, 0.05)',
            borderColor: 'rgba(59, 130, 246, 0.2)',
          },
          '50%': { 
            boxShadow: '0 0 30px rgba(59, 130, 246, 0.15), 0 0 60px rgba(59, 130, 246, 0.08)',
            borderColor: 'rgba(59, 130, 246, 0.3)',
          },
        },
      },
    } 
  },
  plugins: [],
};
export default config;

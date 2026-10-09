import type { Config } from "tailwindcss";

/*
 * "Sunset, warmed brown" theme. Rather than touching ~2,000 class names, the
 * Tailwind families the app already uses are remapped onto a warm palette:
 *   neutral/stone/zinc/gray/slate → espresso-on-linen browns
 *   fuchsia/pink                  → brick-rose (primary, invites)
 *   sky/blue/cyan                 → dusty sage (your own plans)
 *   teal/emerald/green            → olive (polls, success)
 *   amber/orange/yellow           → clay (saved from Today, countdowns)
 *   violet/indigo/purple          → mauve
 *   rose                          → warm red (danger)
 */
const brown = {
  50: "#FBF7F2", 100: "#F3ECE4", 200: "#E8DED2", 300: "#D6C8B9", 400: "#A8988B", 500: "#7A6A60",
  600: "#64544B", 700: "#4A3C35", 800: "#3A2D28", 900: "#2E211D", 950: "#1E1512",
};
const brick = {
  50: "#FBF1EE", 100: "#F5E1DA", 200: "#EBC4B9", 300: "#DDA193", 400: "#CC7A6C", 500: "#C76D62",
  600: "#BD5D53", 700: "#B5524A", 800: "#9E3D3A", 900: "#7E302E", 950: "#451716",
};
const warmRed = {
  50: "#FBEFED", 100: "#F6DCD8", 200: "#EDBAB3", 300: "#E0918A", 400: "#D06A62", 500: "#C24C44",
  600: "#B23A33", 700: "#962E29", 800: "#7A2622", 900: "#62201D", 950: "#36100E",
};
const sage = {
  50: "#F2F5F0", 100: "#E6EADF", 200: "#D3DCCC", 300: "#B8C6B1", 400: "#A3B59C", 500: "#8FA389",
  600: "#7A9074", 700: "#5F7459", 800: "#4B5C47", 900: "#3D4B3A", 950: "#222A20",
};
const olive = {
  50: "#F1F4EC", 100: "#E2E8D8", 200: "#C9D4B9", 300: "#A9BA94", 400: "#8AA073", 500: "#708A5B",
  600: "#5F7A4D", 700: "#4F6641", 800: "#405235", 900: "#34432C", 950: "#1C2418",
};
const clay = {
  50: "#FBF3EE", 100: "#F6E3DA", 200: "#EDCBBD", 300: "#E2AE9B", 400: "#D89A86", 500: "#CF8A78",
  600: "#B9705E", 700: "#9A5747", 800: "#7C4639", 900: "#63382E", 950: "#371D17",
};
const mauve = {
  50: "#F6F1F3", 100: "#ECE2E7", 200: "#DACAD2", 300: "#C3A9B6", 400: "#A78898", 500: "#8E6F80",
  600: "#765B6A", 700: "#624B58", 800: "#503D48", 900: "#42333C", 950: "#251C21",
};

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        white: "#FFFCF8",
        linen: "#F7F0E8",
        neutral: brown, stone: brown, zinc: brown, gray: brown, slate: brown,
        fuchsia: brick, pink: brick,
        rose: warmRed,
        sky: sage, blue: sage, cyan: sage,
        teal: olive, emerald: olive, green: olive,
        amber: clay, orange: clay, yellow: clay,
        violet: mauve, indigo: mauve, purple: mauve,
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;

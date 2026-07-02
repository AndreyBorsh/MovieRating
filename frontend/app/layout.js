import { Inter, Lora, Fraunces } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Header from "./components/Header";

// Inter — UI/body text. Lora — Cyrillic-capable serif for titles/voice.
// Fraunces — display serif for rating numbers (Latin-only, digits only).
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const lora = Lora({ subsets: ["latin", "cyrillic"], variable: "--font-lora", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });

export const metadata = {
  title: "WAW — Оцени фильм",
  description: "Платформа для критических оценок фильмов",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru" className={`${inter.variable} ${lora.variable} ${fraunces.variable}`}>
      <body>
        <AuthProvider>
          <Header />
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 overflow-x-hidden">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}

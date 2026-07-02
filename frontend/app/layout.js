import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Header from "./components/Header";

// Single modern grotesk for the whole UI — glossy/streaming look uses one
// clean sans, heavy weights for display, no serif.
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });

export const metadata = {
  title: "WAW — Оцени фильм",
  description: "Платформа для критических оценок фильмов",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru" className={inter.variable}>
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

import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Header from "./components/Header";

export const metadata = {
  title: "WAW — Оцени фильм",
  description: "Платформа для критических оценок фильмов",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
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

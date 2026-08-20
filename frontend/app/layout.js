import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";

// Single modern grotesk for the whole UI — glossy/streaming look uses one
// clean sans, heavy weights for display, no serif.
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });

export const metadata = {
  title: "WAW — Оцени фильм 🕷",
  description: "Платформа для критических оценок фильмов",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "WAW" },
};

export const viewport = {
  themeColor: "#0b1226",
};

// A corner spider-web (radiating from the corner): spokes + concentric arcs.
function CornerWeb({ className }) {
  return (
    <svg className={className} width="460" height="460" viewBox="0 0 460 460" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g stroke="rgba(255,255,255,0.14)" strokeWidth="1">
        {/* spokes from top-right corner (460,0) */}
        <line x1="460" y1="0" x2="460" y2="460" />
        <line x1="460" y1="0" x2="380" y2="450" />
        <line x1="460" y1="0" x2="290" y2="410" />
        <line x1="460" y1="0" x2="190" y2="345" />
        <line x1="460" y1="0" x2="100" y2="255" />
        <line x1="460" y1="0" x2="35" y2="150" />
        <line x1="460" y1="0" x2="0" y2="55" />
        <line x1="460" y1="0" x2="0" y2="0" />
        {/* concentric arcs centered at 460,0 */}
        <path d="M460 90 A90 90 0 0 1 370 0" />
        <path d="M460 180 A180 180 0 0 1 280 0" />
        <path d="M460 270 A270 270 0 0 1 190 0" />
        <path d="M460 360 A360 360 0 0 1 100 0" />
        <path d="M460 450 A450 450 0 0 1 10 0" />
      </g>
    </svg>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body>
        <div className="spider-web" aria-hidden="true">
          <CornerWeb className="web-tr" />
          <CornerWeb className="web-bl" />
        </div>
        <ServiceWorkerRegister />
        <AuthProvider>
          <Header />
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 overflow-x-hidden">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}

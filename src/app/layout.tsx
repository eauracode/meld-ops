import type { Metadata, Viewport } from "next";
import { Carlito } from "next/font/google";
import "./globals.css";

const carlito = Carlito({ variable: "--font-carlito", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Meld Ops",
  description: "Turn WhatsApp messages into orders, close the day’s deliveries, and send each merchant what they’re owed.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Applies the saved theme before first paint so dark-mode users don't see a light flash.
const themeScript = `try{var t=localStorage.getItem("meld-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={carlito.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

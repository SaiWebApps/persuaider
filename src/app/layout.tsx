import type { Metadata } from "next";
import { Archivo, Source_Serif_4 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

// Self-hosted at build time by next/font, so no third-party stylesheet is fetched at runtime.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], axes: ["opsz"], variable: "--font-source-serif", display: "swap" });

export const metadata: Metadata = {
  title: "Persuaider",
  description: "Practice and improve your negotiation skills with AI-powered training scenarios",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${sourceSerif.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <ClerkProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

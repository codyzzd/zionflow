import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { AppProvider } from "@/components/providers/app-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zionflow",
  description: "Sistema administrativo de ala com dados fake em localStorage para o MVP.",
};

const themeBootScript = `
  (() => {
    try {
      const storageKey = "${THEME_STORAGE_KEY}";
      const storedTheme = window.localStorage.getItem(storageKey);
      const theme = storedTheme === "light" || storedTheme === "dark" || storedTheme === "system" ? storedTheme : "system";
      const resolvedTheme = theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
      const root = document.documentElement;

      root.classList.toggle("dark", resolvedTheme === "dark");
      root.style.colorScheme = resolvedTheme;
      root.dataset.theme = theme;
    } catch {}
  })();
`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <Script id="theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
      </head>
      <body className={geist.variable}>
        <ThemeProvider>
          <TooltipProvider>
            <AppProvider>{children}</AppProvider>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

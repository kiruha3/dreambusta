import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WBook — читай в своём ритме",
  description: "Общая библиотека и чтение по одному слову. Удерживай, чтобы читать; двигай палец, чтобы выбрать свой темп.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}

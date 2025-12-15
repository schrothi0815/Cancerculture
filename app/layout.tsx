import type { Metadata } from "next";
import { Bangers } from "next/font/google";
import "./globals.css";

const bangers = Bangers({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bangers",
});

export const metadata: Metadata = {
  title: "CancerCulture",
  description: "The funny crypto meme community with weekly contests.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${bangers.variable} antialiased bg-orange-background`}>
        {children}
      </body>
    </html>
  );
}

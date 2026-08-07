import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kaahu performance dashboard",
  description: "A combined view of Shopify revenue and Meta ad performance.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

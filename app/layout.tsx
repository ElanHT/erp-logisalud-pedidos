import type { Metadata, Viewport } from "next";
import { Oswald, Poppins } from "next/font/google";
import "./globals.css";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-oswald",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "LOGISALUD Pedidos",
  description:
    "Toma, validación, despacho y documentación electrónica de pedidos — LOGISALUD",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${oswald.variable} ${poppins.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

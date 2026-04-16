import type { Metadata } from "next";
import "./globals.css";
import PolarisProvider from "./components/PolarisProvider";

export const metadata: Metadata = {
  title: "Shopify Changelog Dashboard",
  description: "Track Shopify platform changes, deadlines, and new features",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PolarisProvider>{children}</PolarisProvider>
      </body>
    </html>
  );
}

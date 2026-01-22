import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "../styles/globals.css";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { withBasePath } from "../lib/paths";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SalonBox Info",
  description: "サロン経営者とスタイリストのための総合情報メディア",
  icons: {
    icon: withBasePath("/favicon.ico"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={notoSansJP.variable}>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
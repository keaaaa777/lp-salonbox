import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "../styles/globals.css";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { withBasePath } from "../lib/paths";

const GA_MEASUREMENT_ID = "G-7FCVY8Y59Q";
const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://mactism-products.com";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
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
  const gaInlineScript = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');
`;

  return (
    <html lang="ja">
      <head>
        <script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        />
        <script dangerouslySetInnerHTML={{ __html: gaInlineScript }} />
      </head>
      <body className={notoSansJP.variable}>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}

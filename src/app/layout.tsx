import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "내가 우왕이 될 상인가",
  description: "흩어진 자료에서 경험을 근거와 함께 찾아 쌓아 두는 서비스",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* 글꼴은 Pretendard 하나(ETC docs/design/DESIGN.md) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="flex min-h-full flex-col bg-page">
        {children}
      </body>
    </html>
  );
}

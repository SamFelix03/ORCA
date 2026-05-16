import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { OrcaWeb3Provider } from "@/components/providers/orca-web3-provider";

export const metadata: Metadata = {
  title: "ORCA Control Plane",
  description: "ORCA non-agent orchestration surface built for Kite integration",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={GeistMono.variable}>
      <body>
        <OrcaWeb3Provider>{children}</OrcaWeb3Provider>
      </body>
    </html>
  );
}

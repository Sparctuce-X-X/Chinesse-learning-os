import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { getUserVoice, isCloudTtsConfigured } from "@/server/tts";
import { isLocalSttEnabled } from "@/server/transcribe";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Chinese Learning OS", template: "%s · Chinese Learning OS" },
  description: "Transformer chaque cours de chinois en connaissances mémorisées et utilisables à l'oral.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f6f1",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cloudTts = isCloudTtsConfigured();
  const voice = cloudTts ? await getUserVoice().catch(() => null) : null;
  return (
    <html lang="fr" className={`${geistSans.variable} h-full antialiased`}>
      {/* Configuration audio lue par le client (jamais la clé API). */}
      <body className="min-h-full bg-background" data-tts-cloud={cloudTts ? "1" : "0"} data-tts-voice={voice ?? ""}
        data-stt-local={isLocalSttEnabled() ? "1" : "0"}
      >
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import Providers from "./providers";
import { SAFETY_ACK_COOKIE_NAME, SAFETY_ACK_COOKIE_VALUE } from "@/lib/safety_ack";

const HYDRATION_WATCHDOG_MS = 7000;
const HYDRATION_WATCHDOG_SCRIPT = `
(() => {
  const root = document.documentElement;
  const showWatchdog = () => {
    const el = document.getElementById("yit-hydration-watchdog");
    if (el) el.hidden = false;
  };
  window.__yitShowHydrationWatchdog = showWatchdog;
  window.setTimeout(() => {
    if (root.getAttribute("data-yit-hydrated") === "1") return;
    showWatchdog();
  }, ${HYDRATION_WATCHDOG_MS});
  window.addEventListener("yit:hydrated", () => {
    root.setAttribute("data-yit-hydrated", "1");
    const el = document.getElementById("yit-hydration-watchdog");
    if (el) el.hidden = true;
  });
})();
`;

export const metadata: Metadata = {
  title: "Eureka Karaoke Tube",
  description: "Local-first karaoke sessions over YouTube transcript data",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialSafetyAccepted = cookieStore.get(SAFETY_ACK_COOKIE_NAME)?.value === SAFETY_ACK_COOKIE_VALUE;

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: HYDRATION_WATCHDOG_SCRIPT }} />
        <noscript>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 200,
              background: "#7f1d1d",
              color: "#fff",
              padding: "12px 16px",
              fontSize: "13px",
              lineHeight: 1.4,
            }}
          >
            JavaScript is required for this local UI. If you use Brave or script-blocking extensions, allow scripts on
            localhost and reload.
          </div>
        </noscript>
        <div
          id="yit-hydration-watchdog"
          hidden
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: 0,
            zIndex: 210,
            borderBottom: "1px solid #fcd34d",
            background: "#fffbeb",
            color: "#78350f",
            padding: "8px 14px",
            fontSize: "12px",
            lineHeight: 1.4,
          }}
        >
          Browser protections may be blocking app scripts. If controls appear stuck, allow scripts for localhost
          (Brave Shields/extensions), then hard refresh.
        </div>
        <Providers initialSafetyAccepted={initialSafetyAccepted}>{children}</Providers>
      </body>
    </html>
  );
}

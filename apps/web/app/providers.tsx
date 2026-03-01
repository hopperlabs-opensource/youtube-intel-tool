"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { JobCenter } from "@/components/JobCenter";
import { SafetyNoticeGate } from "@/components/SafetyNoticeGate";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_YIT_DISABLE_HYDRATION_SIGNAL === "1") return;
    document.documentElement.setAttribute("data-yit-hydrated", "1");
    window.dispatchEvent(new Event("yit:hydrated"));
  }, []);

  return (
    <QueryClientProvider client={client}>
      {children}
      <JobCenter />
      <SafetyNoticeGate />
    </QueryClientProvider>
  );
}

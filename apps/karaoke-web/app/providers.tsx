"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SafetyGate } from "@/components/SafetyGate";

type ProvidersProps = {
  children: React.ReactNode;
  initialSafetyAccepted: boolean;
};

export default function Providers({ children, initialSafetyAccepted }: ProvidersProps) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_YIT_DISABLE_HYDRATION_SIGNAL === "1") return;
    document.documentElement.setAttribute("data-yit-hydrated", "1");
    window.dispatchEvent(new Event("yit:hydrated"));
  }, []);

  return (
    <QueryClientProvider client={client}>
      {children}
      <SafetyGate initialAccepted={initialSafetyAccepted} />
    </QueryClientProvider>
  );
}

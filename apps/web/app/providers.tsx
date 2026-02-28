"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { JobCenter } from "@/components/JobCenter";
import { SafetyNoticeGate } from "@/components/SafetyNoticeGate";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      {children}
      <JobCenter />
      <SafetyNoticeGate />
    </QueryClientProvider>
  );
}

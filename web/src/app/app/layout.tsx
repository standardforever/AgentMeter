import type { ReactNode } from "react";
import { ChainEventsProvider } from "@/lib/chainEvents";
import { Gate } from "@/components/dashboard/Gate";
import "./app.css";

export const metadata = { title: "Dashboard" };

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ChainEventsProvider>
      <div className="shell app-shell">
        <Gate>{children}</Gate>
      </div>
    </ChainEventsProvider>
  );
}

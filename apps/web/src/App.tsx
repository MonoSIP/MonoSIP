import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./lib/api";
import { useStore } from "./store";
import { LoginPage } from "./pages/LoginPage";
import { AdminLayout } from "./layouts/AdminLayout";
import { PortalLayout } from "./layouts/PortalLayout";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { ExtensionsPage } from "./pages/admin/ExtensionsPage";
import { TrunksPage } from "./pages/admin/TrunksPage";
import { RoutesPage } from "./pages/admin/RoutesPage";
import { QueuesPage } from "./pages/admin/QueuesPage";
import { RingGroupsPage } from "./pages/admin/RingGroupsPage";
import { SchedulesPage } from "./pages/admin/SchedulesPage";
import { FlowsPage } from "./pages/admin/FlowsPage";
import { FlowDesignerPage } from "./pages/admin/FlowDesignerPage";
import { CdrPage } from "./pages/admin/CdrPage";
import { RecordingsPage } from "./pages/admin/RecordingsPage";
import { MissedPage } from "./pages/admin/MissedPage";
import { ReportsPage } from "./pages/admin/ReportsPage";
import { IntegrationsPage } from "./pages/admin/IntegrationsPage";
import { SettingsPage } from "./pages/admin/SettingsPage";
import { PromptsPage } from "./pages/admin/PromptsPage";
import { DevicesPage } from "./pages/admin/DevicesPage";
import { MohPage } from "./pages/admin/MohPage";
import { PhonePage } from "./pages/portal/PhonePage";
import { DirectoryPage } from "./pages/portal/DirectoryPage";
import { MyCallsPage } from "./pages/portal/MyCallsPage";
import { MyRecordingsPage } from "./pages/portal/MyRecordingsPage";
import { MySettingsPage } from "./pages/portal/MySettingsPage";

export default function App() {
  const actor = useStore((s) => s.actor);
  const setActor = useStore((s) => s.setActor);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    api
      .get<{ actor: NonNullable<typeof actor> }>("/api/v1/auth/me")
      .then((r) => setActor(r.actor))
      .catch(() => setActor(null))
      .finally(() => setBooting(false));
  }, [setActor]);

  if (booting) {
    return (
      <div className="grid h-full place-items-center text-[var(--text-muted)]">
        Loading DSip…
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {actor?.type === "admin" ? (
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="extensions" element={<ExtensionsPage />} />
          <Route path="ring-groups" element={<RingGroupsPage />} />
          <Route path="queues" element={<QueuesPage />} />
          <Route path="schedules" element={<SchedulesPage />} />
          <Route path="flows" element={<FlowsPage />} />
          <Route path="flows/:id" element={<FlowDesignerPage />} />
          <Route path="trunks" element={<TrunksPage />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="prompts" element={<PromptsPage />} />
          <Route path="moh" element={<MohPage />} />
          <Route path="recordings" element={<RecordingsPage />} />
          <Route path="cdr" element={<CdrPage />} />
          <Route path="missed" element={<MissedPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      ) : actor?.type === "extension" ? (
        <Route path="/" element={<PortalLayout />}>
          <Route index element={<PhonePage />} />
          <Route path="directory" element={<DirectoryPage />} />
          <Route path="calls" element={<MyCallsPage />} />
          <Route path="recordings" element={<MyRecordingsPage />} />
          <Route path="settings" element={<MySettingsPage />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
      {actor ? <Route path="*" element={<Navigate to="/" replace />} /> : null}
    </Routes>
  );
}

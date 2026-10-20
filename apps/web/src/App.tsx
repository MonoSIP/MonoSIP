import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./lib/api";
import { useStore } from "./store";
import { Spinner } from "./components/motion";

function lazyNamed<M extends Record<string, unknown>>(loader: () => Promise<M>, exportName: keyof M & string) {
  return lazy(async () => {
    let mod: M;
    try {
      mod = await loader();
    } catch (err) {
      // After a redeploy the old chunk hashes are gone: reload once to pick up the new build.
      const key = "dsip:chunk-reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw err;
    }
    sessionStorage.removeItem("dsip:chunk-reload");
    return { default: mod[exportName] as React.ComponentType };
  });
}

const LoginPage = lazyNamed(() => import("./pages/LoginPage"), "LoginPage");
const AdminLayout = lazyNamed(() => import("./layouts/AdminLayout"), "AdminLayout");
const PortalLayout = lazyNamed(() => import("./layouts/PortalLayout"), "PortalLayout");
const DashboardPage = lazyNamed(() => import("./pages/admin/DashboardPage"), "DashboardPage");
const ExtensionsPage = lazyNamed(() => import("./pages/admin/ExtensionsPage"), "ExtensionsPage");
const TrunksPage = lazyNamed(() => import("./pages/admin/TrunksPage"), "TrunksPage");
const RoutesPage = lazyNamed(() => import("./pages/admin/RoutesPage"), "RoutesPage");
const BlacklistPage = lazyNamed(() => import("./pages/admin/BlacklistPage"), "BlacklistPage");
const QueuesPage = lazyNamed(() => import("./pages/admin/QueuesPage"), "QueuesPage");
const RingGroupsPage = lazyNamed(() => import("./pages/admin/RingGroupsPage"), "RingGroupsPage");
const SchedulesPage = lazyNamed(() => import("./pages/admin/SchedulesPage"), "SchedulesPage");
const FlowsPage = lazyNamed(() => import("./pages/admin/FlowsPage"), "FlowsPage");
const FlowDesignerPage = lazyNamed(() => import("./pages/admin/FlowDesignerPage"), "FlowDesignerPage");
const CdrPage = lazyNamed(() => import("./pages/admin/CdrPage"), "CdrPage");
const RecordingsPage = lazyNamed(() => import("./pages/admin/RecordingsPage"), "RecordingsPage");
const MissedPage = lazyNamed(() => import("./pages/admin/MissedPage"), "MissedPage");
const ReportsPage = lazyNamed(() => import("./pages/admin/ReportsPage"), "ReportsPage");
const IntegrationsPage = lazyNamed(() => import("./pages/admin/IntegrationsPage"), "IntegrationsPage");
const SettingsPage = lazyNamed(() => import("./pages/admin/SettingsPage"), "SettingsPage");
const PromptsPage = lazyNamed(() => import("./pages/admin/PromptsPage"), "PromptsPage");
const DevicesPage = lazyNamed(() => import("./pages/admin/DevicesPage"), "DevicesPage");
const MohPage = lazyNamed(() => import("./pages/admin/MohPage"), "MohPage");
const PhonePage = lazyNamed(() => import("./pages/portal/PhonePage"), "PhonePage");
const DirectoryPage = lazyNamed(() => import("./pages/portal/DirectoryPage"), "DirectoryPage");
const MyCallsPage = lazyNamed(() => import("./pages/portal/MyCallsPage"), "MyCallsPage");
const MyRecordingsPage = lazyNamed(() => import("./pages/portal/MyRecordingsPage"), "MyRecordingsPage");
const MySettingsPage = lazyNamed(() => import("./pages/portal/MySettingsPage"), "MySettingsPage");

function BootScreen({ label = "Loading DSip…" }: { label?: string }) {
  return (
    <div className="grid h-full place-items-center text-[var(--text-muted)]">
      <div className="flex flex-col items-center gap-3 text-sm">
        <Spinner size={32} />
        {label}
      </div>
    </div>
  );
}

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
    return <BootScreen />;
  }

  return (
    <Suspense fallback={<BootScreen label="Loading page…" />}>
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
            <Route path="blacklist" element={<BlacklistPage />} />
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
    </Suspense>
  );
}

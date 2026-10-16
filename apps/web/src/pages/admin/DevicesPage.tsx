import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../../lib/api";

type Ext = { id: string; number: string; name: string };
type Dev = {
  id: string;
  extensionId: string;
  model: string | null;
  mac: string | null;
  provisioningProfile: string | null;
};

const PROFILES = ["softphone", "yealink", "fanvil", "grandstream", "generic"] as const;

export function DevicesPage() {
  const qc = useQueryClient();
  const [extensionId, setExtensionId] = useState("");
  const [model, setModel] = useState("softphone");
  const [mac, setMac] = useState("");
  const [profile, setProfile] = useState("softphone");
  const [qr, setQr] = useState<string | null>(null);

  const exts = useQuery({
    queryKey: ["extensions"],
    queryFn: () => api.get<Ext[]>("/api/v1/admin/extensions"),
  });
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.get<Dev[]>("/api/v1/admin/devices"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/api/v1/admin/devices", {
        extensionId,
        model,
        mac: mac.trim() || null,
        provisioningProfile: profile,
      }),
    onSuccess: () => {
      toast.success("Device added");
      setMac("");
      void qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  async function showQr(id: string) {
    const r = await api.get<{ qr: string; uri: string }>("/api/v1/admin/devices/" + id + "/qr");
    setQr(r.qr);
    toast.message(r.uri);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Devices / Softphone QR</h1>
      <form
        className="card flex flex-wrap gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <select
          className="input"
          value={extensionId}
          onChange={(e) => setExtensionId(e.target.value)}
          required
        >
          <option value="">Extension…</option>
          {exts.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.number} — {e.name}
            </option>
          ))}
        </select>
        <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" />
        <input
          className="input font-mono"
          value={mac}
          onChange={(e) => setMac(e.target.value)}
          placeholder="MAC (aa:bb:…)"
        />
        <select className="input" value={profile} onChange={(e) => setProfile(e.target.value)}>
          {PROFILES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit">
          Add device
        </button>
      </form>
      {qr && <img src={qr} alt="SIP QR" className="h-48 w-48 rounded border border-[var(--border)]" />}
      <div className="card overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Extension</th>
              <th>Model</th>
              <th>MAC</th>
              <th>Profile</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {devices.data?.map((d) => {
              const ext = exts.data?.find((e) => e.id === d.extensionId);
              return (
                <tr key={d.id}>
                  <td className="font-mono">{ext?.number ?? d.extensionId.slice(0, 8)}</td>
                  <td>{d.model ?? "—"}</td>
                  <td className="font-mono text-xs">{d.mac ?? "—"}</td>
                  <td>{d.provisioningProfile ?? "—"}</td>
                  <td className="flex gap-2">
                    <button className="btn" type="button" onClick={() => void showQr(d.id)}>
                      QR
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() =>
                        void api.delete(`/api/v1/admin/devices/${d.id}`).then(() =>
                          qc.invalidateQueries({ queryKey: ["devices"] }),
                        )
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

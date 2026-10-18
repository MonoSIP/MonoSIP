import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, List, Network, QrCode, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { IconBtn, PageHeader, SectionCard, SelectField, TextField } from "../../components/ui";

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
      <PageHeader
        icon={QrCode}
        title="Devices / Softphone QR"
        tone="blue"
        description="Provision desk phones and generate SIP QR codes for mobile softphones"
      />
      <SectionCard title="Add device" icon={Smartphone} tone="blue">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <SelectField
            label="Extension"
            icon={Smartphone}
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
          </SelectField>
          <TextField
            label="Model"
            icon={Cpu}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model"
          />
          <TextField
            label="MAC"
            icon={Network}
            className="font-mono"
            value={mac}
            onChange={(e) => setMac(e.target.value)}
            placeholder="MAC (aa:bb:…)"
          />
          <SelectField
            label="Provisioning profile"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
          >
            {PROFILES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectField>
          <button className="btn btn-primary w-fit" type="submit">
            Add device
          </button>
        </form>
      </SectionCard>
      {qr && (
        <SectionCard title="SIP QR" icon={QrCode} tone="cyan">
          <img src={qr} alt="SIP QR" className="h-48 w-48 rounded border border-[var(--border)]" />
        </SectionCard>
      )}
      <SectionCard title="Devices" icon={List} tone="cyan" flush>
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
              {(devices.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-[var(--text-muted)]">
                    No devices yet.
                  </td>
                </tr>
              ) : (
                devices.data?.map((d) => {
                  const ext = exts.data?.find((e) => e.id === d.extensionId);
                  return (
                    <tr key={d.id}>
                      <td className="font-mono">{ext?.number ?? d.extensionId.slice(0, 8)}</td>
                      <td>{d.model ?? "—"}</td>
                      <td className="font-mono text-xs">{d.mac ?? "—"}</td>
                      <td>{d.provisioningProfile ?? "—"}</td>
                      <td className="col-actions">
                        <div className="btn-icon-row">
                          <IconBtn icon={QrCode} label="QR" onClick={() => void showQr(d.id)} />
                          <IconBtn
                            icon={Trash2}
                            label="Delete"
                            danger
                            onClick={() =>
                              void api.delete(`/api/v1/admin/devices/${d.id}`).then(() =>
                                qc.invalidateQueries({ queryKey: ["devices"] }),
                              )
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
      </SectionCard>
    </div>
  );
}

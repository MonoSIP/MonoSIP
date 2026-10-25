import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Cpu, List, Network, QrCode, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Button, IconBtn, PageHeader, SectionCard, SelectField, TextField } from "../../components/ui";
import { tr } from "../../i18n";

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
  const [provisionUrl, setProvisionUrl] = useState<string | null>(null);

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
      toast.success(tr("Device added"));
      setMac("");
      void qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  async function showQr(id: string) {
    const r = await api.get<{ qr: string; uri: string; provisionUrl: string | null }>(
      "/api/v1/admin/devices/" + id + "/qr",
    );
    setQr(r.qr);
    setProvisionUrl(r.provisionUrl);
    toast.message(r.uri);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={QrCode}
        title={tr("Devices / Softphone QR")}
        tone="blue"
        description={tr("Desk phones and SIP QR")}
      />
      <SectionCard title={tr("Devices")} icon={List} tone="cyan" flush>
        <table className="table">
            <thead>
              <tr>
                <th>{tr("Extension")}</th>
                <th>{tr("Model")}</th>
                <th>{tr("MAC")}</th>
                <th>{tr("Profile")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(devices.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-[var(--text-muted)]">
                    {tr("No devices yet.")}
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
                          <IconBtn icon={QrCode} label={tr("QR")} onClick={() => void showQr(d.id)} />
                          <IconBtn
                            icon={Trash2}
                            label={tr("Delete")}
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
      {qr && (
        <SectionCard title={tr("SIP QR")} icon={QrCode} tone="cyan">
          <img src={qr} alt="SIP QR" className="h-48 w-48 rounded" />
          {provisionUrl && (
            <div className="mt-3">
              <p className="text-sm text-[var(--text-muted)]">{tr("Provisioning URL")}</p>
              <code className="block break-all rounded-lg bg-[var(--bg)] p-2 font-mono text-xs">
                {provisionUrl}
              </code>
              <IconBtn
                className="mt-2"
                icon={Copy}
                label={tr("Copy provisioning URL")}
                onClick={() => {
                  void navigator.clipboard.writeText(provisionUrl);
                  toast.success(tr("Provisioning URL copied"));
                }}
              />
            </div>
          )}
        </SectionCard>
      )}
      <SectionCard title={tr("Add device")} icon={Smartphone} tone="blue">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <SelectField
            label={tr("Extension")}
            icon={Smartphone}
            value={extensionId}
            onValueChange={setExtensionId}
            required
            options={[
              { value: "", label: tr("Extension…") },
              ...(exts.data ?? []).map((e) => ({ value: e.id, label: `${e.number} — ${e.name}` })),
            ]}
          />
          <TextField
            label={tr("Model")}
            icon={Cpu}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={tr("Model")}
          />
          <TextField
            label={tr("MAC")}
            icon={Network}
            className="font-mono"
            value={mac}
            onChange={(e) => setMac(e.target.value)}
            placeholder={tr("MAC (aa:bb:…)")}
          />
          <SelectField
            label={tr("Provisioning profile")}
            value={profile}
            onValueChange={setProfile}
            options={PROFILES.map((p) => ({ value: p, label: p }))}
          />
          <Button variant="solid" className="w-fit" type="submit">
            {tr("Add device")}
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}

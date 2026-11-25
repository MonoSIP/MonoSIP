import { useTranslation } from "react-i18next";
import { ArrowUpRight, X } from "lucide-react";
import type { UpdateStatus } from "../hooks/useUpdateCheck";

type Props = {
  status: UpdateStatus;
  onDismiss: () => void;
};

export function UpdateBanner({ status, onDismiss }: Props) {
  const { t } = useTranslation();
  const versionLabel = status.latest.startsWith("v") ? status.latest : `v${status.latest}`;

  return (
    <div className="update-banner" role="status">
      <div className="update-banner-copy">
        <span className="update-banner-dot" aria-hidden />
        <span className="update-banner-text">
          {t("updates.available", { version: versionLabel })}
        </span>
        <a
          className="update-banner-link"
          href={status.releaseUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t("updates.whatsNew")}
          <ArrowUpRight size={14} strokeWidth={2.25} aria-hidden />
        </a>
      </div>
      <button
        type="button"
        className="update-banner-dismiss"
        aria-label={t("updates.dismiss")}
        onClick={onDismiss}
      >
        <X size={14} strokeWidth={2.25} />
      </button>
    </div>
  );
}

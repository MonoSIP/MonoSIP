import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { HomePage } from "@/views/home";

const title = "MunaSIP — Aramalarınız. Akışınız. Kontrolünüz.";
const description =
  "Küçük ofisler için kendi sunucunuzda çalışan Asterisk santrali. SIP operatörlerini bağlayın, aramaları görsel IVR ile yönlendirin, ekibinize tarayıcı telefonu ve sesli mesaj kutusu verin.";

export const metadata: Metadata = {
  ...pageMetadata(title, description, "/tr/", "tr"),
  title: { absolute: title },
};

export default function TurkishHome() {
  return <HomePage locale="tr" />;
}

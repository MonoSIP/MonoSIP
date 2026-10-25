import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icon";
import type { Locale } from "@/lib/locale";
import { pathFor } from "@/lib/locale";

const marks = (L: (en: string, tr: string) => string) => [
  {
    file: "monosip-mark.svg",
    title: L("The original mark.", "Özgün işaret."),
    text: L(
      "The handset and check, with the original green gradient and proportions.",
      "Özgün yeşil geçiş ve oranlarla ahize ve onay.",
    ),
    type: "mark",
  },
  {
    file: "monosip-wordmark.svg",
    title: L("The original wordmark.", "Özgün yazı işareti."),
    text: L(
      "The existing MonoSIP spelling and geometry. The SVG inherits text color when embedded inline.",
      "Mevcut MonoSIP yazımı ve geometrisi. SVG satır içine gömüldüğünde metin rengini devralır.",
    ),
    type: "wordmark",
  },
  {
    file: "monosip-mark-mono.svg",
    title: L("A single-color mark.", "Tek renkli işaret."),
    text: L(
      "The original monochrome SVG for single-color applications.",
      "Tek renkli kullanımlar için özgün tek renk SVG.",
    ),
    type: "mono",
  },
];
export function BrandPage({ locale = "en" }: { locale?: Locale }) {
  const L = (en: string, tr: string) => (locale === "tr" ? tr : en);
  const tr = locale === "tr";
  const items = marks(L);
  return (
    <div className="container">
      <div className="page-hero">
        <nav
          className="breadcrumb"
          aria-label={tr ? "Sayfa yolu" : "Breadcrumb"}
        >
          <Link href={pathFor(locale, "/")}>{tr ? "Ana sayfa" : "Home"}</Link>
          <span>/</span>
          {tr ? "Marka dosyaları" : "Brand assets"}
        </nav>
        <p className="eyebrow">
          {L(
            "A FAMILIAR MARK. A CLEAR CONNECTION.",
            "TANIDIK BİR İŞARET. NET BİR BAĞLANTI.",
          )}
        </p>
        <h1>
          {L("Made to be", "Görünce")}
          <br />
          <span>{L("recognized.", "tanınsın.")}</span>
        </h1>
        <p>
          {L(
            "The original MonoSIP brand files. Preserved as SVG, with a handset for the conversation and a check for the right fit.",
            "Özgün MonoSIP marka dosyaları. Konuşma için bir ahize, doğru eşleşme için bir onay ile SVG olarak korundu.",
          )}
        </p>
      </div>
      <div className="brand-grid">
        {items.map((mark) => (
          <article className="brand-card" key={mark.file}>
            <div className={`brand-swatch ${mark.type}`}>
              <Image
                src={`/brand/${mark.file}`}
                width={mark.type === "wordmark" ? 520 : 128}
                height={128}
                alt={
                  tr
                    ? `Resmi MonoSIP ${mark.type}`
                    : `Official MonoSIP ${mark.type}`
                }
              />
            </div>
            <div className="brand-card-bottom">
              <h2>{mark.title}</h2>
              <p>{mark.text}</p>
              <a href={`/brand/${mark.file}`} download>
                <Icon name="download" /> {L("Download SVG", "SVG indir")}
              </a>
            </div>
          </article>
        ))}
      </div>
      <div className="prose" style={{ paddingBottom: 80 }}>
        <h2>
          {L("Keep the connection consistent.", "Bağlantıyı tutarlı tutun.")}
        </h2>
        <p>
          {L(
            "Use the supplied vector files without changing the handset, check, geometry or proportions. Give the mark clear space and keep it legible. The original mark keeps its green gradient and works on both light and dark surfaces. The interface uses this teal.",
            "Ahizeyi, onayı, geometriyi veya oranları değiştirmeden verilen vektör dosyalarını kullanın. İşarete boşluk bırakın ve okunur tutun. Özgün işaret yeşil geçişini korur ve hem açık hem koyu zeminde durur. Arayüz bu teal rengini kullanır.",
          )}
        </p>
        <div className="palette">
          {[
            [L("Teal", "Teal"), "#0f766e"],
            [L("Signal", "Sinyal"), "#1aa892"],
            [L("Mint", "Nane"), "#7ee0cf"],
          ].map(([name, color]) => (
            <div key={color}>
              <i style={{ "--swatch": color } as CSSProperties} />
              <span>
                <strong>{name}</strong>
                <code>{color}</code>
              </span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 32 }}>
          {L(
            "The website uses Outfit for interface and body text, and JetBrains Mono for commands and technical labels. Buttons and links use the same teal as the product console. Original wordmark artwork is retained as provided.",
            "Site, arayüz ve gövde metni için Outfit, komutlar ve teknik etiketler için JetBrains Mono kullanır. Düğmeler ve bağlantılar ürün konsoluyla aynı teal rengindedir. Özgün yazı işareti verildiği gibi durur.",
          )}
        </p>
      </div>
    </div>
  );
}

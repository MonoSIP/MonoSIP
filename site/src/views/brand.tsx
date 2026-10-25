import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icon";
import type { Locale } from "@/lib/locale";
import { pathFor } from "@/lib/locale";
import { brandFile } from "@/lib/site";

const marks = (L: (en: string, tr: string) => string) => [
  {
    file: "monosip-stacked.svg",
    ground: "light",
    title: L("Stacked logo.", "Dikey logo."),
    text: L(
      "The sound mark above the name. Use this where the logo stands alone.",
      "Ses işaretinin altında ad. Logonun tek başına durduğu yerde bunu kullanın.",
    ),
    type: "wide",
    width: 640,
    height: 300,
  },
  {
    file: "monosip-lockup.svg",
    ground: "light",
    title: L("Horizontal lockup.", "Yatay logo."),
    text: L(
      "Gradient mark and the name on one line, for light backgrounds.",
      "Açık zemin için geçişli işaret ve ad, tek satırda.",
    ),
    type: "wide",
    width: 720,
    height: 110,
  },
  {
    file: "monosip-lockup-on-dark.svg",
    ground: "dark",
    title: L("Horizontal lockup, dark.", "Yatay logo, koyu zemin."),
    text: L(
      "The same lockup with a light wordmark, for dark backgrounds.",
      "Koyu zemin için aynı yatay logo, açık renk yazıyla.",
    ),
    type: "wide",
    width: 720,
    height: 110,
  },
  {
    file: "monosip-lockup-solid.svg",
    ground: "light",
    title: L("Solid lockup.", "Tek renkli yatay logo."),
    text: L(
      "One ink for print and small sizes.",
      "Baskı ve küçük boyutlar için tek mürekkep.",
    ),
    type: "wide",
    width: 720,
    height: 110,
  },
  {
    file: "monosip-symbol.svg",
    ground: "light",
    title: L("Sound mark.", "Ses işareti."),
    text: L(
      "The gradient M and its bars, without the name.",
      "Ad olmadan, geçişli M ve çubukları.",
    ),
    type: "wide",
    width: 640,
    height: 320,
  },
  {
    file: "monosip-wordmark.svg",
    ground: "light",
    title: L("Wordmark.", "Yazı işareti."),
    text: L("The MONOSIP lettering on its own.", "Tek başına MONOSIP yazısı."),
    type: "wide",
    width: 720,
    height: 80,
  },
  {
    file: "monosip-symbol-mono.svg",
    ground: "light",
    title: L("Single-color mark.", "Tek renkli işaret."),
    text: L(
      "The mark in the current text color, for one-ink use.",
      "Tek mürekkep için, metin rengini alan işaret.",
    ),
    type: "wide",
    width: 640,
    height: 320,
  },
  {
    file: "monosip-mark.svg",
    ground: "light",
    title: L("App icon.", "Uygulama ikonu."),
    text: L(
      "Square tile for the product chrome, the favicon and avatars. Put it beside interface text, not in place of the lockup.",
      "Ürün arayüzü, favicon ve avatar için kare karo. Yazının yanına koyun; yatay logonun yerine koymayın.",
    ),
    type: "tile",
    width: 128,
    height: 128,
  },
  {
    file: "monosip-mark-light.svg",
    ground: "light",
    title: L("Light app icon.", "Açık uygulama ikonu."),
    text: L("Green mark on a light tile.", "Açık karo üzerinde yeşil işaret."),
    type: "tile",
    width: 128,
    height: 128,
  },
  {
    file: "monosip-mark-dark.svg",
    ground: "dark",
    title: L("Dark app icon.", "Koyu uygulama ikonu."),
    text: L("White mark on a deep green tile.", "Koyu yeşil karo üzerinde beyaz işaret."),
    type: "tile",
    width: 128,
    height: 128,
  },
  {
    file: "monosip-mark-inverse.svg",
    ground: "night",
    title: L("Night app icon.", "Gece uygulama ikonu."),
    text: L("Gradient mark on black.", "Siyah üzerinde geçişli işaret."),
    type: "tile",
    width: 128,
    height: 128,
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
          {L("AN M, AND THE SOUND AROUND IT.", "BİR M, VE ETRAFINDAKİ SES.")}
        </p>
        <h1>
          {L("Made to be", "Görünce")}
          <br />
          <span>{L("recognized.", "tanınsın.")}</span>
        </h1>
        <p>
          {L(
            "The MonoSIP mark is an M between sound bars. Use the square icon beside interface text. Use a lockup where the logo stands alone.",
            "MonoSIP işareti, ses çubuklarının arasındaki bir M'dir. Arayüz yazısının yanında kare ikonu kullanın. Logo tek başına duracaksa kilitli düzeni kullanın.",
          )}
        </p>
      </div>
      <div className="brand-grid">
        {items.map((mark) => (
          <article className="brand-card" key={mark.file}>
            <div className={`brand-swatch ${mark.type}`} data-ground={mark.ground}>
              <Image
                src={brandFile(mark.file)}
                width={mark.width}
                height={mark.height}
                alt={
                  tr
                    ? `MonoSIP ${mark.title}`
                    : `MonoSIP ${mark.title}`
                }
              />
            </div>
            <div className="brand-card-bottom">
              <h2>{mark.title}</h2>
              <p>{mark.text}</p>
              <a href={brandFile(mark.file)} download>
                <Icon name="download" /> {L("Download SVG", "SVG indir")}
              </a>
            </div>
          </article>
        ))}
      </div>
      <div className="prose" style={{ paddingBottom: 80 }}>
        <h2>
          {L("Keep the mark intact.", "İşareti bozmadan kullanın.")}
        </h2>
        <p>
          {L(
            "Use the supplied vectors without redrawing the M, the bars or the lettering. Leave clear space around the logo and do not recolor the gradient files. The solid lockup is the one-ink version.",
            "M'yi, çubukları veya yazıyı yeniden çizmeden verilen vektörleri kullanın. Logonun çevresine boşluk bırakın ve geçişli dosyaların rengini değiştirmeyin. Tek mürekkep sürümü, düz renkli yatay logodur.",
          )}
        </p>
        <div className="palette">
          {[
            [L("Leaf", "Yaprak"), "#2cb56a"],
            [L("Grove", "Koruluk"), "#14945c"],
            [L("Deep", "Derin"), "#064e3c"],
            [L("Ink", "Mürekkep"), "#073f36"],
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
            "The website uses Outfit for interface and body text, and JetBrains Mono for commands and technical labels.",
            "Site, arayüz ve gövde metni için Outfit, komutlar ve teknik etiketler için JetBrains Mono kullanır.",
          )}
        </p>
      </div>
    </div>
  );
}

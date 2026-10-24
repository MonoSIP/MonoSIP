import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Brand assets",
  "Official MunaSIP SVG logo files, monochrome mark and brand colors, preserved from the original project.",
  "/brand/",
);
const marks = [
  {
    file: "munasip-mark.svg",
    title: "The original mark.",
    text: "The handset and check, with the original green gradient and proportions.",
    type: "mark",
  },
  {
    file: "munasip-wordmark.svg",
    title: "The original wordmark.",
    text: "The existing MünaSIP spelling and geometry. The SVG inherits text color when embedded inline.",
    type: "wordmark",
  },
  {
    file: "munasip-mark-mono.svg",
    title: "A single-color mark.",
    text: "The original monochrome SVG for single-color applications.",
    type: "mono",
  },
];
export default function Brand() {
  return (
    <div className="container">
      <div className="page-hero">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>Brand assets
        </nav>
        <p className="eyebrow">A FAMILIAR MARK. A CLEAR CONNECTION.</p>
        <h1>
          Made to be
          <br />
          <span>recognized.</span>
        </h1>
        <p>
          The original MunaSIP brand files. Preserved as SVG, with a handset for
          the conversation and a check for the right fit.
        </p>
      </div>
      <div className="brand-grid">
        {marks.map((mark) => (
          <article className="brand-card" key={mark.file}>
            <div className={`brand-swatch ${mark.type}`}>
              <Image
                src={`/brand/${mark.file}`}
                width={mark.type === "wordmark" ? 520 : 128}
                height={128}
                alt={`Official MunaSIP ${mark.type}`}
              />
            </div>
            <div className="brand-card-bottom">
              <h2>{mark.title}</h2>
              <p>{mark.text}</p>
              <a href={`/brand/${mark.file}`} download>
                <Icon name="download" /> Download SVG
              </a>
            </div>
          </article>
        ))}
      </div>
      <div className="prose" style={{ paddingBottom: 80 }}>
        <h2>Keep the connection consistent.</h2>
        <p>
          Use the supplied vector files without changing the handset, check,
          geometry or proportions. Give the mark clear space and keep it
          legible. The original mark keeps its green gradient and works on both
          light and dark surfaces. The interface uses this teal.
        </p>
        <div className="palette">
          {[
            ["Teal", "#0f766e"],
            ["Signal", "#1aa892"],
            ["Mint", "#7ee0cf"],
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
          The website uses Outfit for interface and body text, and JetBrains
          Mono for commands and technical labels. Buttons and links use the same
          teal as the product console. Original wordmark artwork is retained as
          provided.
        </p>
      </div>
    </div>
  );
}

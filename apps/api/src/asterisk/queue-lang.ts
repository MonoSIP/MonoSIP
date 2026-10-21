/** Queue announcement language: the queue's own choice, else the system default. */
export function queueLanguage(queueLang: string | null | undefined, systemLang: "tr" | "en"): "tr" | "en" {
  return queueLang === "tr" || queueLang === "en" ? queueLang : systemLang;
}

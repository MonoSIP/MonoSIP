import { tr } from "../i18n";

/** Translated copy for the shared Pagination footer. */
export function pagerLabels() {
  return {
    range: (from: number, to: number, total: number) =>
      tr("{{from}}–{{to}} of {{total}}", { from, to, total }),
    perPage: tr("Rows per page"),
    prev: tr("Previous page"),
    next: tr("Next page"),
    page: (n: number) => tr("Page {{n}}", { n }),
  };
}

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

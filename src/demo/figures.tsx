import React from "react";
import type { ArgumentVersion } from "./types";
import { FIGURE_TOKEN } from "./briefs";

/**
 * Resolves figure placeholders in card copy into clickable numbers.
 *
 * The point is not convenience but integrity: a card that retypes "51.46%" by
 * hand can silently disagree with the Decimal result it is describing. Here the
 * prose references the argument, and the displayed figure is read from that
 * argument's verification record at render time. Clicking it opens the chain
 * that produced it, so provenance is one interaction away from every number.
 */

export interface FigureLookup {
  (argumentId: string): ArgumentVersion | undefined;
}

interface Options {
  lookup: FigureLookup;
  onOpen: (argumentId: string) => void;
}

export function renderWithFigures(text: string, { lookup, onOpen }: Options): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const pattern = new RegExp(FIGURE_TOKEN.source, "gi");
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      out.push(text.slice(cursor, match.index));
    }

    const [, kind, argumentId] = match;
    const av = lookup(argumentId);
    const numeric = av?.numeric;

    if (kind.toUpperCase() === "GAP") {
      // A gap is descriptive prose, not a clickable cell reference.
      out.push(
        <span key={`k${key++}`} className="rd-fig-gap">
          {numeric?.gapDisplay ?? "差额未计算"}
        </span>,
      );
    } else if (!numeric) {
      out.push(<span key={`k${key++}`}>{argumentId}</span>);
    } else if (numeric.result === null) {
      // An honest refusal renders as such — it never masquerades as a figure.
      out.push(
        <button
          key={`k${key++}`}
          type="button"
          className="fig is-refused"
          onClick={() => onOpen(argumentId)}
          title={numeric.refusalReason}
        >
          拒绝计算
        </button>,
      );
    } else {
      out.push(
        <button
          key={`k${key++}`}
          type="button"
          className="fig"
          onClick={() => onOpen(argumentId)}
          title={`${numeric.formulaId} · 点击查看计算链与原文`}
        >
          {numeric.resultDisplay}
        </button>,
      );
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

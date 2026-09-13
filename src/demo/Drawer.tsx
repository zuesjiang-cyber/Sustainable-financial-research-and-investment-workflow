import React, { useEffect } from "react";
import { X } from "lucide-react";

/**
 * A light side panel that opens over the desk without navigating away from the
 * thesis that summoned it. Evidence belongs beside the claim, not on another
 * page — the analyst should never lose their place in the list.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
  labelledBy?: string;
}

export const Drawer: React.FC<Props> = ({ open, onClose, title, sub, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="rd-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="rd-drawer" role="dialog" aria-modal="true" aria-label="详情">
        <div className="rd-drawer-head">
          <div style={{ minWidth: 0 }}>
            <h2>{title}</h2>
            {sub && <p className="rd-drawer-sub">{sub}</p>}
          </div>
          <button type="button" className="rd-close" onClick={onClose} aria-label="关闭">
            <X />
          </button>
        </div>
        <div className="rd-drawer-body">{children}</div>
      </aside>
    </>
  );
};

import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useLatest } from '../hooks/useLatest';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const BODY_LOCK_CLASS = 'modal-open';
const openPanels: HTMLElement[] = [];

function focusableIn(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

function trapTab(event: KeyboardEvent, panel: HTMLElement): void {
  const items = focusableIn(panel);
  const first = items[0];
  const last = items.at(-1) as HTMLElement; // the close button guarantees at least one item
  const active = document.activeElement;
  const outside = !panel.contains(active) || active === panel;
  if (event.shiftKey && (outside || active === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (outside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Modal dialog: traps Tab, closes on Escape or a click on the backdrop, and returns focus to the opener. */
export function Dialog({ title, onClose, children, footer, wide = false }: Readonly<DialogProps>) {
  const titleId = useId();
  const [panel, setPanel] = useState<HTMLDialogElement | null>(null);
  const [opener] = useState(() => document.activeElement);
  const onCloseRef = useLatest(onClose);

  useEffect(() => {
    if (panel === null) return undefined;
    openPanels.push(panel);
    document.body.classList.add(BODY_LOCK_CLASS);
    const isTop = () => openPanels.at(-1) === panel;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === 'Tab') {
        trapTab(event, panel);
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      if (isTop() && event.target === panel.parentElement) onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    const autofocus = panel.querySelector<HTMLElement>('[data-autofocus]');
    (autofocus ?? panel).focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
      openPanels.splice(openPanels.indexOf(panel), 1);
      if (openPanels.length === 0) document.body.classList.remove(BODY_LOCK_CLASS);
    };
  }, [panel, onCloseRef]);

  useEffect(
    () => () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    },
    [opener],
  );

  // The modal behaviour (focus trap, Escape, backdrop click, scroll lock) is implemented above; the native element is
  // rendered with `open` because jsdom has no showModal() and a top-layer dialog would bypass the stacking logic.
  return (
    <div className="dialog-overlay">
      <dialog
        ref={setPanel}
        open
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={wide ? 'dialog dialog-wide' : 'dialog'}
      >
        <div className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer === undefined ? null : <div className="dialog-footer">{footer}</div>}
      </dialog>
    </div>
  );
}

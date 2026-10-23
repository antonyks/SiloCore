import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface ProviderActionDialogProps {
  label: string;
  busy: boolean;
  wide?: boolean;
  returnFocusTo: HTMLElement | null;
  fallbackFocusTo: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
}

const ProviderActionDialog: React.FC<ProviderActionDialogProps> = ({
  label,
  busy,
  wide = false,
  returnFocusTo,
  fallbackFocusTo,
  onClose,
  children,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-dialog-initial-focus]")?.focus();

    return () => {
      if (dialog?.open) dialog.close();
      const target = returnFocusTo?.isConnected ? returnFocusTo : fallbackFocusTo;
      target?.focus();
    };
  }, [returnFocusTo, fallbackFocusTo]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className={`fixed inset-y-0 right-0 m-auto max-h-[calc(100dvh-2rem)] max-w-none overflow-hidden rounded-md bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 ${wide ? "sm:max-w-4xl" : "sm:max-w-lg"}`}
      style={{
        left: "var(--admin-sidebar-width, 0px)",
        width: "calc(100vw - var(--admin-sidebar-width, 0px) - 2rem)",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        aria-label="Close dialog"
        className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div data-dialog-scroll className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {children}
      </div>
    </dialog>
  );
};

export default ProviderActionDialog;

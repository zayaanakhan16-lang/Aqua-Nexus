import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "@/components/ui/Modal";

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button">outside before</button>
      <Modal
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Create study area"
      >
        <input aria-label="Study-area name" />
        <button type="button">Cancel</button>
        <button type="button">Save study area</button>
      </Modal>
      <button type="button">outside after</button>
    </>
  );
}

describe("Modal accessibility", () => {
  it("exposes dialog semantics and moves focus into the panel on open", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Create study area");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("wraps Tab from the last control back to the first", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: /close dialog/i });
    const save = screen.getByRole("button", { name: /save study area/i });

    // jsdom does not implement Tab focus movement, so this asserts the trap
    // itself moved focus: without it, activeElement would stay on `save`.
    save.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it("wraps Shift+Tab from the first control to the last", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: /close dialog/i });
    const save = screen.getByRole("button", { name: /save study area/i });

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(save);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { DocumentDownloadAction } from "./DocumentDownloadAction";
import { DocxEditor } from "./DocxEditor";

afterEach(cleanup);

describe("DOCX download action", () => {
  it("offers the current copy and preserved original through the existing download icon", async () => {
    const current = vi.fn();
    const original = vi.fn();
    render(<I18nProvider locale="ru"><DocumentDownloadAction compact onDownloadCurrent={current} onDownloadOriginal={original} /></I18nProvider>);

    fireEvent.keyDown(screen.getByRole("button", { name: "Скачать" }), { key: "Enter" });
    expect(current).not.toHaveBeenCalled();
    expect(original).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Скачать оригинал" }));
    expect(original).toHaveBeenCalledOnce();
    expect(current).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("button", { name: "Скачать" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Скачать текущую копию" }));
    expect(current).toHaveBeenCalledOnce();
  });

  it("downloads the current copy directly when there is no source file", () => {
    const current = vi.fn();
    render(<I18nProvider locale="en"><DocumentDownloadAction compact onDownloadCurrent={current} /></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Download current copy" }));
    expect(current).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("uses the host locale in the editor's download menu", async () => {
    render(<DocxEditor showFileUpload={false} readOnly canExport locale="en"
      initialContent={[{ type: "paragraph", children: [{ text: "Contract" }] }] as any}
      onDownloadOriginal={vi.fn()} />);
    fireEvent.keyDown(await screen.findByRole("button", { name: "Download" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "Download original" })).toBeTruthy();
  });
});

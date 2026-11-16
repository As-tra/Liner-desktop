import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTrayMenuTemplate,
  loadBackgroundPlaySettings,
  parseBackgroundPlaySettings,
  saveBackgroundPlaySettings,
  shouldHideOnClose,
} from "./background-play";

describe("parseBackgroundPlaySettings", () => {
  it("defaults to enabled for missing or malformed data", () => {
    expect(parseBackgroundPlaySettings(null)).toEqual({ enabled: true });
    expect(parseBackgroundPlaySettings("x")).toEqual({ enabled: true });
    expect(parseBackgroundPlaySettings({ enabled: "no" })).toEqual({
      enabled: true,
    });
  });

  it("keeps an explicit choice", () => {
    expect(parseBackgroundPlaySettings({ enabled: false })).toEqual({
      enabled: false,
    });
  });
});

describe("background play settings file", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "liner-bg-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("round-trips through disk and defaults when the file is absent", () => {
    const file = path.join(dir, "background-play.json");
    expect(loadBackgroundPlaySettings(file)).toEqual({ enabled: true });
    saveBackgroundPlaySettings(file, { enabled: false });
    expect(loadBackgroundPlaySettings(file)).toEqual({ enabled: false });
  });

  it("falls back to the default on corrupt json", () => {
    const file = path.join(dir, "background-play.json");
    fs.writeFileSync(file, "{not json");
    expect(loadBackgroundPlaySettings(file)).toEqual({ enabled: true });
  });
});

describe("shouldHideOnClose", () => {
  const base = {
    enabled: true,
    quitting: false,
    trayAvailable: true,
    platform: "win32" as NodeJS.Platform,
  };

  it("hides when enabled, not quitting and the tray exists", () => {
    expect(shouldHideOnClose(base)).toBe(true);
  });

  it("lets a real quit close the window", () => {
    expect(shouldHideOnClose({ ...base, quitting: true })).toBe(false);
  });

  it("closes normally when the setting is off", () => {
    expect(shouldHideOnClose({ ...base, enabled: false })).toBe(false);
  });

  it("closes normally without a tray on windows/linux", () => {
    expect(shouldHideOnClose({ ...base, trayAvailable: false })).toBe(false);
    expect(
      shouldHideOnClose({ ...base, trayAvailable: false, platform: "linux" }),
    ).toBe(false);
  });

  it("still hides on macos without a tray, the dock reopens it", () => {
    expect(
      shouldHideOnClose({ ...base, trayAvailable: false, platform: "darwin" }),
    ).toBe(true);
  });
});

describe("buildTrayMenuTemplate", () => {
  const handlers = () => ({
    onShow: vi.fn(),
    onHide: vi.fn(),
    onAction: vi.fn(),
    onToggleBackgroundPlay: vi.fn(),
    onQuit: vi.fn(),
  });

  it("offers show while hidden and pause while playing", () => {
    const h = handlers();
    const menu = buildTrayMenuTemplate({
      windowVisible: false,
      status: "playing",
      backgroundPlay: true,
      ...h,
    });
    const labels = menu.map((item) => item.label).filter(Boolean);
    expect(labels).toEqual([
      "Show Liner",
      "Pause",
      "Next",
      "Previous",
      "Keep playing when window is closed",
      "Quit Liner",
    ]);
    menu[0]!.click!({} as never, undefined, {} as never);
    expect(h.onShow).toHaveBeenCalled();
  });

  it("routes playback items and quit", () => {
    const h = handlers();
    const menu = buildTrayMenuTemplate({
      windowVisible: true,
      status: "paused",
      backgroundPlay: false,
      ...h,
    });
    const byLabel = (l: string) => menu.find((item) => item.label === l)!;
    expect(byLabel("Hide Liner")).toBeTruthy();
    byLabel("Play").click!({} as never, undefined, {} as never);
    byLabel("Next").click!({} as never, undefined, {} as never);
    byLabel("Previous").click!({} as never, undefined, {} as never);
    expect(h.onAction.mock.calls.map((c) => c[0])).toEqual([
      "togglePlay",
      "next",
      "prev",
    ]);
    const toggle = byLabel("Keep playing when window is closed");
    expect(toggle.checked).toBe(false);
    toggle.click!({ checked: true } as never, undefined, {} as never);
    expect(h.onToggleBackgroundPlay).toHaveBeenCalledWith(true);
    byLabel("Quit Liner").click!({} as never, undefined, {} as never);
    expect(h.onQuit).toHaveBeenCalled();
  });
});

// Background play: closing the main window hides it instead of ending the app,
// so the renderer (which owns the audio element) keeps running and music keeps
// playing. A tray icon brings the window back and is the way to quit for real.
//
// The setting is stored in userData/background-play.json and can be switched
// off from the tray menu, which restores the old "close = quit" behaviour.

import fs from "node:fs";
import {
  Menu,
  Tray,
  nativeImage,
  type MenuItemConstructorOptions,
} from "electron";

export type BackgroundPlaySettings = { enabled: boolean };

export const DEFAULT_BACKGROUND_PLAY: BackgroundPlaySettings = {
  enabled: true,
};

export function parseBackgroundPlaySettings(
  raw: unknown,
): BackgroundPlaySettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_BACKGROUND_PLAY };
  const data = raw as Record<string, unknown>;
  return {
    enabled:
      typeof data.enabled === "boolean"
        ? data.enabled
        : DEFAULT_BACKGROUND_PLAY.enabled,
  };
}

export function loadBackgroundPlaySettings(
  filePath: string,
): BackgroundPlaySettings {
  try {
    return parseBackgroundPlaySettings(
      JSON.parse(fs.readFileSync(filePath, "utf-8")),
    );
  } catch {
    return { ...DEFAULT_BACKGROUND_PLAY };
  }
}

export function saveBackgroundPlaySettings(
  filePath: string,
  settings: BackgroundPlaySettings,
) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf-8");
  } catch (e) {
    console.warn("[background-play] Could not write settings:", e);
  }
}

/**
 * Whether a close request on the main window should hide it instead.
 * A real quit (tray "Quit", cmd+q, updater install, OS shutdown) always wins.
 */
export function shouldHideOnClose(state: {
  enabled: boolean;
  quitting: boolean;
  trayAvailable: boolean;
  platform: NodeJS.Platform;
}): boolean {
  if (!state.enabled || state.quitting) return false;
  // macos always has the dock icon to come back through (app "activate");
  // elsewhere, if the tray icon could not be created, fall back to quitting so
  // the app never ends up running with no visible way to reach or quit it
  return state.platform === "darwin" || state.trayAvailable;
}

export type PlaybackStatus = "playing" | "paused" | "loading" | string;
export type TrayAction = "prev" | "togglePlay" | "next";

export function buildTrayMenuTemplate(state: {
  windowVisible: boolean;
  status: PlaybackStatus;
  backgroundPlay: boolean;
  onShow: () => void;
  onHide: () => void;
  onAction: (action: TrayAction) => void;
  onToggleBackgroundPlay: (enabled: boolean) => void;
  onQuit: () => void;
}): MenuItemConstructorOptions[] {
  const playing = state.status === "playing" || state.status === "loading";
  return [
    state.windowVisible
      ? { label: "Hide Liner", click: state.onHide }
      : { label: "Show Liner", click: state.onShow },
    { type: "separator" },
    {
      label: playing ? "Pause" : "Play",
      click: () => state.onAction("togglePlay"),
    },
    { label: "Next", click: () => state.onAction("next") },
    { label: "Previous", click: () => state.onAction("prev") },
    { type: "separator" },
    {
      label: "Keep playing when window is closed",
      type: "checkbox",
      checked: state.backgroundPlay,
      click: (item) => state.onToggleBackgroundPlay(item.checked),
    },
    { type: "separator" },
    { label: "Quit Liner", click: state.onQuit },
  ];
}

export interface BackgroundPlayTrayDeps {
  iconPath: string;
  settingsPath: string;
  isWindowVisible: () => boolean;
  showWindow: () => void;
  hideWindow: () => void;
  sendAction: (action: TrayAction) => void;
  quit: () => void;
}

export class BackgroundPlayTray {
  private tray: Tray | null = null;
  private status: PlaybackStatus = "paused";
  private settings: BackgroundPlaySettings;

  constructor(private readonly deps: BackgroundPlayTrayDeps) {
    this.settings = loadBackgroundPlaySettings(deps.settingsPath);
  }

  /** creates the tray icon; returns false if the platform refused it */
  create(): boolean {
    if (this.tray) return true;
    try {
      let icon = nativeImage.createFromPath(this.deps.iconPath);
      if (!icon.isEmpty()) {
        // tray slots are small; a 512px icon is scaled badly on some platforms
        const size = process.platform === "darwin" ? 18 : 22;
        icon = icon.resize({ width: size, height: size, quality: "best" });
      }
      this.tray = new Tray(icon);
      this.tray.setToolTip("Liner");
      // left click toggles the window on windows/linux; macos opens the menu
      if (process.platform !== "darwin") {
        this.tray.on("click", () => {
          if (this.deps.isWindowVisible()) this.deps.hideWindow();
          else this.deps.showWindow();
          this.refresh();
        });
      }
      this.refresh();
      return true;
    } catch (e) {
      console.warn("[background-play] Could not create tray icon:", e);
      this.tray = null;
      return false;
    }
  }

  isAvailable(): boolean {
    return Boolean(this.tray && !this.tray.isDestroyed());
  }

  isEnabled(): boolean {
    return this.settings.enabled;
  }

  setStatus(status: PlaybackStatus) {
    if (status === this.status) return;
    this.status = status;
    this.refresh();
  }

  refresh() {
    if (!this.isAvailable()) return;
    const menu = Menu.buildFromTemplate(
      buildTrayMenuTemplate({
        windowVisible: this.deps.isWindowVisible(),
        status: this.status,
        backgroundPlay: this.settings.enabled,
        onShow: () => {
          this.deps.showWindow();
          this.refresh();
        },
        onHide: () => {
          this.deps.hideWindow();
          this.refresh();
        },
        onAction: (action) => this.deps.sendAction(action),
        onToggleBackgroundPlay: (enabled) => {
          this.settings = { enabled };
          saveBackgroundPlaySettings(this.deps.settingsPath, this.settings);
          this.refresh();
        },
        onQuit: () => this.deps.quit(),
      }),
    );
    this.tray!.setContextMenu(menu);
  }

  destroy() {
    if (this.tray && !this.tray.isDestroyed()) this.tray.destroy();
    this.tray = null;
  }
}

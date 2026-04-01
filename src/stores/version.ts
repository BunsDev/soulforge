import { create } from "zustand";
import {
  type ChangelogRelease,
  CURRENT_VERSION,
  checkForUpdate,
  detectInstallMethod,
  type InstallMethod,
  type VersionCheckResult,
} from "../core/version.js";

interface VersionState {
  current: string;
  latest: string | null;
  changelog: ChangelogRelease[];
  currentRelease: ChangelogRelease | null;
  changelogError: boolean;
  updateAvailable: boolean;
  installMethod: InstallMethod;
  checking: boolean;

  check: () => Promise<void>;
}

export const useVersionStore = create<VersionState>()((set) => ({
  current: CURRENT_VERSION,
  latest: null,
  changelog: [],
  currentRelease: null,
  changelogError: false,
  updateAvailable: false,
  installMethod: detectInstallMethod(),
  checking: false,

  check: async () => {
    set({ checking: true });
    try {
      const result: VersionCheckResult = await checkForUpdate();
      set({
        current: result.current,
        latest: result.latest,
        changelog: result.changelog,
        currentRelease: result.currentRelease,
        changelogError: result.changelogError,
        updateAvailable: result.updateAvailable,
        checking: false,
      });
    } catch {
      set({ checking: false });
    }
  },
}));

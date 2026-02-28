import { create } from "zustand";

type UiState = {
  atMs: number;
  followMode: boolean;
  selectedCueId: string | null;
  setAtMs: (ms: number) => void;
  setFollowMode: (v: boolean) => void;
  selectCue: (cueId: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  atMs: 0,
  followMode: true,
  selectedCueId: null,
  setAtMs: (ms) => set({ atMs: ms }),
  setFollowMode: (v) => set({ followMode: v }),
  selectCue: (cueId) => set({ selectedCueId: cueId }),
}));


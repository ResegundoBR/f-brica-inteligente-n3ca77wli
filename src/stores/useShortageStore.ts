import { create } from 'zustand'

interface Store {
  availableIds: string[]
  selectedIds: string[]
  setAvailableIds: (ids: string[]) => void
  toggle: (id: string) => void
  toggleAll: () => void
  clear: () => void
}

export const useShortageStore = create<Store>((set) => ({
  availableIds: [],
  selectedIds: [],
  setAvailableIds: (ids) =>
    set((state) => {
      if (
        state.availableIds.length === ids.length &&
        state.availableIds.every((id, index) => id === ids[index])
      ) {
        return state
      }
      return { availableIds: ids }
    }),
  toggle: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((i) => i !== id)
        : [...state.selectedIds, id],
    })),
  toggleAll: () =>
    set((state) => ({
      selectedIds:
        state.selectedIds.length === state.availableIds.length && state.availableIds.length > 0
          ? []
          : [...state.availableIds],
    })),
  clear: () => set({ selectedIds: [] }),
}))

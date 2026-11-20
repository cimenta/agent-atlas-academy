// The keys of the Library page, apart from the page: what a key does to the list, and what the letter keys do to the chosen run.
// Each action returns false when it had nothing to act on, so the page can say so.

// A key pressed with a card of the list focused. at: index of the focused card (-1 when none); returns true when the key was used.
export function listKey(event, { ids, at, selectAt, tickAt, loadAt, switchTab, leave }) {
  const used = () => {
    event.preventDefault?.();
    return true;
  };
  switch (event.key) {
    case "ArrowDown":
    case "ArrowUp": {
      if (ids.length === 0) return false;
      const next = at < 0 ? 0 : Math.min(ids.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)));
      selectAt(next);
      return used();
    }
    case "ArrowLeft":
    case "ArrowRight":
      switchTab();
      return used();
    case " ":
      if (at < 0) return false;
      tickAt(at);
      return used();
    case "Enter":
      if (at < 0) return false;
      loadAt(at);
      return used();
    case "Escape":
      leave();
      return used();
    default:
      return false;
  }
}

// The actions of the letter keys. state supplies what is chosen and ticked and does the work.
export function libraryActions(state) {
  const chosen = () => state.selectedId() ?? null;
  const own = (id) => id !== null && state.isOwn(id);
  return {
    load() {
      const id = chosen();
      if (id === null) return false;
      state.load(id);
      return true;
    },
    compare() {
      if (state.ticked().length < 2) return false;
      state.compare();
      return true;
    },
    exportTicked() {
      const ticked = state.ticked();
      if (ticked.length === 0) return false;
      state.exportRuns(ticked);
      return true;
    },
    exportAllMine() {
      const mine = state.mineIds();
      if (mine.length === 0) return false;
      state.exportRuns(mine);
      return true;
    },
    useInCreate() {
      const id = chosen();
      if (id === null || !state.hasDefinition(id)) return false;
      state.useInCreate(id);
      return true;
    },
    editDescription() {
      const id = chosen();
      if (!own(id)) return false;
      state.editDescription(id);
      return true;
    },
    remove() {
      const id = chosen();
      if (!own(id)) return false;
      state.remove(id);
      return true;
    },
  };
}

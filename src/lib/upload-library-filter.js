// Level tag artwork is managed in Platform Rules, not the equippable badge library.
// fileName also covers replaced/unlinked legacy backgrounds without a relation.
export const uploadLibraryFilter = {
  archivedAt: null,
  levelTagBackgrounds: { none: {} },
  NOT: { fileName: 'level-background.webp', distribution: 'MANUAL', storeVisible: false },
};

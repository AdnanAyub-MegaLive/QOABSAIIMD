// An unsaved editor draft, never a substitute for live account progression.
export function progressionEditorData(configuration) {
  const source = configuration ?? {
    version: 0, enabled: false, rules: [],
    levels: ["USER", "CHARM"].map(track => ({
      track, level: 0, thresholdPoints: "0", badgeAssetId: null, benefits: [],
    })),
  };
  return {
    configured: configuration != null,
    version: source.version, enabled: source.enabled, rules: source.rules,
    levels: source.levels.map(({track,level,thresholdPoints,badgeAssetId,benefits}) =>
      ({track,level,thresholdPoints:String(thresholdPoints),badgeAssetId,benefits})),
  };
}

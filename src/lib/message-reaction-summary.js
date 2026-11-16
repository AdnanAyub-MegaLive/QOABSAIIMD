export function summarizeReactions(reactions = [], viewerId) {
  const grouped = new Map();
  for (const {emoji,userId} of reactions) {
    const row = grouped.get(emoji) ?? {emoji,count:0,mine:false};
    row.count++; row.mine ||= Boolean(viewerId && userId === viewerId);
    grouped.set(emoji,row);
  }
  return [...grouped.values()].sort((a,b)=>a.emoji.localeCompare(b.emoji));
}
export function validateReactionEmoji(value) {
  if (typeof value !== "string" || value.length > 64 || !value.length ||
      [...new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(value)].length !== 1 ||
      !/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(value)) {
    throw Object.assign(new Error("Choose a single emoji."),{code:"VALIDATION_ERROR"});
  }
  return value;
}

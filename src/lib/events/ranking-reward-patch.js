// Change only the rewards renderer/loading block; retain the published design and assets.
export function patchRewardModal(source, template) {
  const start=source.indexOf('  function renderRewards(data){');
  const end=source.indexOf('  const notify =',start);
  const newStart=template.indexOf('  function renderRewards(data){');
  const newEnd=template.indexOf('  const notify =',newStart);
  if(start<0||end<0||newStart<0||newEnd<0)throw new Error('Unrecognized ranking rewards script; update this event manually.');
  return source.slice(0,start)+template.slice(newStart,newEnd)+source.slice(end);
}

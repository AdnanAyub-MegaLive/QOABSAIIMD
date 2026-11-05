'use client';
export default function CpMediaUpload({ label, value, animation = false, onUploaded, onRemove, onBusy, onMessage }) {
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    onBusy(true); onMessage('Uploading ' + file.name + '…');
    try {
      const form = new FormData(); form.set('file', file); form.set('purpose', animation ? 'animation' : 'image');
      const response = await fetch('/api/admin/cp-levels/media', { method: 'POST', body: form });
      const text = await response.text(); let result;
      try { result = JSON.parse(text); } catch { throw Error(`Upload failed (${response.status}). Check the file size and connection.`); }
      if (!response.ok) throw Error(result.error?.message ?? 'Upload failed.');
      onUploaded(result.data); onMessage('File uploaded. Save the level to apply it.');
    } catch (error) { onMessage(error.message); } finally { onBusy(false); }
  }
  return <div><label className="block">{label}<input className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" type="file" accept={animation ? '.svga,video/mp4' : 'image/png,image/jpeg,image/webp,image/gif'} onChange={upload} /></label>
    <p className="mt-1 text-xs text-slate-500">{animation ? 'SVGA or MP4' : 'PNG, JPEG, WebP or GIF'} · Maximum 15 MB</p>
    {value && <div className="mt-2 flex gap-3 text-sm"><a href={value} target="_blank" rel="noreferrer" className="text-teal-800 underline">View current file</a><button type="button" onClick={onRemove}>Remove file</button></div>}
  </div>;
}

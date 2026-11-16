"use client";
import Image from "next/image";
import { useState } from "react";
import { ImageOff, FileImage, LoaderCircle, Maximize2, X } from "lucide-react";
import PortalDialog from "./portal-dialog";
import { SVGA_MIME } from "@/lib/svga-policy";

export default function MediaPreview(props) {
  return <Preview key={`${props.url}:${props.posterUrl}:${props.type}`} {...props}/>;
}
function Preview({ url, type, name = "Media", eager = false, posterUrl, expanded = false }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const svga = type === SVGA_MIME;
  const video = type?.startsWith("video/");
  const audio = type?.startsWith("audio/");
  const source = svga ? posterUrl : url;
  return <div className="portal-preview">
    {!source || failed ? <div className="portal-preview-empty" role="status"><ImageOff size={26} strokeWidth={1.5}/><strong>{failed ? "Preview unavailable" : svga ? "SVGA animation" : "No preview yet"}</strong><span>{failed ? "The media could not be loaded. Check the file or try again." : svga ? "Add a poster image to preview this animation." : "Choose a file to see it here."}</span>{failed && <button type="button" className="portal-button" onClick={()=>{setFailed(false);setLoaded(false);}}>Retry preview</button>}</div> : audio ? <audio src={url} controls preload="none" className="w-full px-4" aria-label={`${name} audio preview`} onError={()=>setFailed(true)}/> : video ? <video src={url} poster={posterUrl||undefined} controls playsInline preload="metadata" className="h-full w-full object-contain" aria-label={`${name} video preview`} onError={()=>setFailed(true)}/> : <>
      {!loaded && <span role="status" aria-label="Loading preview" className="absolute inset-0 grid place-items-center"><LoaderCircle size={22} className="animate-spin text-[#087f74]"/></span>}
      <Image src={source} alt={`${name}${svga ? " poster" : " preview"}`} fill unoptimized loading={eager ? "eager" : "lazy"} sizes="(max-width: 640px) 100vw, 50vw" className="object-contain p-2" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>
    </>}
    {svga && <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-[#124a42] px-2 py-1 text-[10px] font-bold text-white"><FileImage size={12}/> SVGA poster</span>}
    {source && !failed && !expanded && !audio && <button type="button" aria-label={`Expand ${name} preview`} onClick={()=>setOpen(true)} className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-lg border border-white/50 bg-white/95 text-[#183b37] shadow-sm hover:bg-white"><Maximize2 size={16}/></button>}
    {open && <PortalDialog onClose={()=>setOpen(false)} aria-label={`${name} expanded preview`} className="portal-ui fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#071f1d]/80 p-4 backdrop-blur-sm"><div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between gap-4 border-b p-4"><h3 className="truncate font-semibold">{name}</h3><button type="button" className="portal-button" aria-label="Close preview" onClick={()=>setOpen(false)}><X size={18}/></button></div><div className="h-[min(70dvh,640px)]"><Preview url={url} type={type} name={name} posterUrl={posterUrl} expanded eager/></div></div></PortalDialog>}
  </div>;
}

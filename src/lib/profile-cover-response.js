export function coverResponse(row, range) {
 const bytes=Buffer.from(row.imageData),size=bytes.length;
 const headers={"Content-Type":row.mimeType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Accept-Ranges":"bytes"};
 if(!range)return new Response(bytes,{headers:{...headers,"Content-Length":String(size)}});
 const match=/^bytes=(\d*)-(\d*)$/.exec(range);
 let start,end;
 if(match&&(match[1]||match[2])){
  if(!match[1]){start=Math.max(0,size-Number(match[2]));end=size-1;}
  else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
 }
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return new Response(null,{status:416,headers:{...headers,"Content-Range":`bytes */${size}`}});
 return new Response(bytes.subarray(start,end+1),{status:206,headers:{...headers,"Content-Range":`bytes ${start}-${end}/${size}`,"Content-Length":String(end-start+1)}});
}

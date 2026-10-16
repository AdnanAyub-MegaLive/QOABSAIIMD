// Local visual QA only. Synthetic records never reach the database or deployed event.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('event-templates/rankings');
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
    const person=i=>({publicId:`PREVIEW-${i}`,name:`Preview ${i}`,userLevel:4,charmLevel:3});
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,data:{entries:Array.from({length:5},(_,i)=>({id:`PREVIEW-${i}`,rank:i+1,name:`Preview ${i+1}`,person:person(i+1),partner:person(i+6),score:String(1050000-i*99000),level:4,memberCount:120})),nextOffset:null,generatedAt:new Date().toISOString(),resetsAt:new Date(Date.now()+3600000).toISOString(),rule:'LOCAL VISUAL FIXTURES — not real ranking records.'}}));return;
  }
  const target=path.resolve(root,url.pathname.replace('/event/rankings/',''));
  if(!target.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  try{let bytes=await readFile(target);const ext=path.extname(target);if(ext==='.html')bytes=Buffer.from(bytes.toString().replace('</body>','<script>addEventListener("DOMContentLoaded",()=>window.MegaRankings.setSession("local-preview"))</script></body>'));res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'})[ext]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}
}).listen(4320,'127.0.0.1',()=>console.log('Visual fixtures: http://127.0.0.1:4320/event/rankings/index.html'));

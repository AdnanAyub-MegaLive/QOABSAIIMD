import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {config} from 'dotenv';
config({path:'.env.local',quiet:true});
const {prisma}=await import('../src/lib/prisma.js');
const {validateCardRanges}=await import('../src/lib/profile-card-artwork.js');
const folder=process.argv.find(x=>x.startsWith('--assets='))?.slice(9);
if(!folder)throw Error('Provide --assets=/absolute/path; add --apply to import.');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
if(manifest.length!==10||manifest.some((r,i)=>r.level!==i+1||r.file!==`level-${i+1}.gif`))throw Error('Expected numbered levels 1–10.');
const assets=manifest.map(r=>{const bytes=fs.readFileSync(path.join(folder,r.file));if(createHash('sha256').update(bytes).digest('hex')!==r.sha256||!bytes.subarray(0,6).toString().startsWith('GIF8'))throw Error('Badge integrity check failed');return {publicId:`AST-AGENCY-LEVEL-${String(r.level).padStart(2,'0')}`,name:`Agency level ${r.level} badge`,fileName:r.file,mimeType:'image/gif',fileSize:bytes.length,fileData:bytes};});
for(const color of ['blue','red']){const bytes=fs.readFileSync(path.join(folder,`${color}.png`));assets.push({publicId:`AST-AGENCY-BG-${color.toUpperCase()}`,name:`Agency ${color} profile background`,fileName:`${color}.png`,mimeType:'image/png',fileSize:bytes.length,fileData:bytes});}
const current=await prisma.profileCardArtwork.findUnique({where:{id:'GLOBAL'}});
const ranges=validateCardRanges([...(current?.ranges??[]).filter(r=>r.track!=='AGENCY'),...Array.from({length:50},(_,i)=>({track:'AGENCY',min:i+1,max:i+1,badgeAssetId:i<10?assets[i].publicId:null,backgroundAssetId:i<5?'AST-AGENCY-BG-BLUE':i<10?'AST-AGENCY-BG-RED':null}))]);
console.log(JSON.stringify({assets:assets.map(({publicId,fileSize})=>({publicId,fileSize})),configuredLevels:10,emptyLevels:40,apply:process.argv.includes('--apply')}));
try{if(process.argv.includes('--apply'))await prisma.$transaction(async tx=>{
 for(const asset of assets){const data={...asset,category:'AGENCY_ARTWORK',distribution:'FREE',isGlobal:true,storeVisible:false,active:true,archivedAt:null};await tx.uploadAsset.upsert({where:{publicId:asset.publicId},create:data,update:data});}
 if(current){const updated=await tx.profileCardArtwork.updateMany({where:{id:'GLOBAL',revision:current.revision},data:{ranges,revision:{increment:1}}});if(updated.count!==1)throw Error('Artwork changed during import. Retry.');}
 else await tx.profileCardArtwork.create({data:{id:'GLOBAL',revision:1,ranges}});
 await tx.auditLog.create({data:{action:'AGENCY_LEVEL_ARTWORK_IMPORTED',category:'CONTENT_MANAGEMENT',entityType:'ProfileCardArtwork',entityId:'GLOBAL',description:'Imported user-supplied agency badges 1–10 and backgrounds; levels 11–50 empty.',metadata:{assets:assets.map(x=>x.publicId)}}});
},{timeout:60000});}finally{await prisma.$disconnect();}

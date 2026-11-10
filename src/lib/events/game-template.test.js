import { expect, it, vi } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
vi.mock('./config.js',()=>({getEventConfig:()=>({maxFiles:100,maxUploadBytes:100*1024*1024,maxExtractedBytes:100*1024*1024})}));
import { filesFromFormData } from './storage.js';
it.each(['game','weekly-star'])('creates a complete %s template through the production upload validator',async track=>{
 const root=`event-templates/ranking-${track}`;
 const names=['index.html','app.js','style.css',...((await readdir(root)).includes('design.js')?['design.js']:[]),...(await readdir(root+'/assets')).map(n=>'assets/'+n)];
 const form=new FormData();
 for(const name of names){form.append('files',new File([await readFile(root+'/'+name)],name.split('/').at(-1)));form.append('paths',name);}
 const result=await filesFromFormData(form);
 expect(result.files).toHaveLength(names.length);
 const html=(await readFile(root+'/index.html','utf8'));expect(html).toContain(`data-track="${track}"`);expect(html).toContain(`/event/ranking-${track}/`);
 const content=await readFile(root+'/style.css','utf8');
 for(const match of content.matchAll(/assets\/([\w.-]+)/g))expect(names).toContain('assets/'+match[1]);
},30000);

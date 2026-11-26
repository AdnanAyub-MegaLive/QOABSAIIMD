import http from 'node:http';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// Only use the localhost-only rollout listener; no credentials or user actions.
function request(path, localAddress, body) {
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:9080,path,localAddress,
      method:body?'POST':'GET',headers:body?{'Content-Type':'text/plain','Content-Length':Buffer.byteLength(body)}:{}},res=>{
      let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,worker:res.headers['x-rollout-worker'],body:text}));
    });
    req.setTimeout(3000,()=>req.destroy(Error('timeout')));req.on('error',reject);req.end(body);
  });
}
if(process.argv[2]==='--monitor'){
  const duration=Number(process.argv[3]||180000),end=Date.now()+duration;
  const results={startedAt:new Date().toISOString(),requests:0,failures:0,maxMs:0,statuses:{}};
  while(Date.now()<end){
    const start=Date.now();
    try{const response=await request('/api/health',`127.0.${1+results.requests%8}.1`);results.statuses[response.status]=(results.statuses[response.status]||0)+1;if(response.status!==200)results.failures++;}
    catch{results.failures++;}
    results.requests++;results.maxMs=Math.max(results.maxMs,Date.now()-start);await delay(100);
  }
  console.log(JSON.stringify({...results,finishedAt:new Date().toISOString()}));
  process.exitCode=results.failures?1:0;
}else{
  const expected=Number(process.argv[2]||2),workers=new Set();
  for(let i=1;i<=24;i++){
    const source=`127.0.${i}.1`;
    const open=await request('/socket.io/?EIO=4&transport=polling',source);
    assert.equal(open.status,200);assert.equal(open.body[0],'0');
    const {sid}=JSON.parse(open.body.slice(1));
    const close=await request(`/socket.io/?EIO=4&transport=polling&sid=${encodeURIComponent(sid)}`,source,'1');
    assert.equal(close.status,200,'Polling SID must stay on the accepting worker');
    assert.equal(close.worker,open.worker,'Routing must stay sticky');workers.add(open.worker);
  }
  assert.equal(workers.size,expected);
  console.log(JSON.stringify({pollingSessions:24,workers:[...workers],affinity:'passed'}));
}

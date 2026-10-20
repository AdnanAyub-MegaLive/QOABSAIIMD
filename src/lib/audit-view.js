const sensitive = /password|secret|token|authorization|cookie|privatekey|encryptionkey|signature|displaySig|bank|iban|accountnumber|routingnumber|cnic|passport|filedata|ciphertext|proofurl/i;
export function safeAuditDetails(value,depth=0){
 if(depth>8)return '[TRUNCATED]';
 if(value===null||value===undefined)return value??null;
 if(typeof value==='bigint')return String(value);
 if(typeof value==='string'){
  if(/Bearer\s+\S+|-----BEGIN.*PRIVATE KEY|data:[^;]+;base64,/i.test(value))return '[REDACTED]';
  return value.replace(/([?&](?:sig|displaySig|token|key|credential|signature|X-Amz-[^= &]+)=)[^ &]*/gi,'$1[REDACTED]').slice(0,4000);
 }
 if(Array.isArray(value))return value.slice(0,100).map(v=>safeAuditDetails(v,depth+1));
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,150).map(([k,v])=>[k,sensitive.test(k)?'[REDACTED]':safeAuditDetails(v,depth+1)]));
 return value;
}
export function auditFilters(params={}){
 const text=key=>typeof params[key]==='string'?params[key].trim().slice(0,200):'';
 const q=text('q'),category=text('category')||'All',action=text('action'),entity=text('entity'),from=text('from'),to=text('to');
 const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value+'T00:00:00.000Z'):null;
 const start=date(from),end=date(to);if(end)end.setUTCDate(end.getUTCDate()+1);
 const where={...(category!=='All'?{category}:{}),...(action?{action:{contains:action,mode:'insensitive'}}:{}),...(entity?{entityId:{contains:entity,mode:'insensitive'}}:{}),...((start||end)?{createdAt:{...(start?{gte:start}:{}),...(end?{lt:end}:{})}}:{})};
 if(q)where.OR=['action','description','entityId','entityType'].map(key=>({[key]:{contains:q,mode:'insensitive'}})).concat([{admin:{is:{name:{contains:q,mode:'insensitive'}}}},{admin:{is:{email:{contains:q,mode:'insensitive'}}}}],['actorPublicId','actorUserId','actorBdUserId','requestId','transactionId'].map(key=>({metadata:{path:[key],equals:q}})));
 return {where,query:q,category,action,entity,from:start?from:'',to:end?to:''};
}
export function auditRow(log){
 const details=safeAuditDetails(log.metadata),m=details&&typeof details==='object'&&!Array.isArray(details)?details:{};
 const actor=m.actorPublicId??m.actorUserId??m.actorBdUserId??m.adminEmail??null;
 return {id:log.id,createdAt:log.createdAt.toISOString(),adminName:log.admin?.name??(actor?'User / service actor':'Unspecified actor'),adminEmail:log.admin?.email??(actor?String(actor):'Not recorded'),category:log.category,action:log.action,entityId:log.entityId,entityType:log.entityType,description:safeAuditDetails(log.description),ipAddress:log.ipAddress??null,details,reason:typeof m.reason==='string'?m.reason:null,outcome:typeof m.outcome==='string'?m.outcome:'Not recorded'};
}

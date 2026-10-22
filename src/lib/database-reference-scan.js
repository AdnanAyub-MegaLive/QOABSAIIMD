// Match identifiers, never display names, balances or arbitrary substrings.
// Short/numeric IDs require an ID-bearing field or explicit URL/channel context.
const idField = key => /(?:id|ids|reference|references|entity|target|recipient|sender|owner|user|uid)$/i.test(key);
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function containsDatabaseReference(value, identifiers, key='') {
  if(value===null||value===undefined)return false;
  if(Array.isArray(value))return value.some(v=>containsDatabaseReference(v,identifiers,key));
  if(typeof value==='object')return Object.entries(value).some(([k,v])=>identifiers.has(k)||containsDatabaseReference(v,identifiers,k));
  if(typeof value!=='string'&&typeof value!=='number')return false;
  let text=String(value);try{text=decodeURIComponent(text);}catch{}
  for(const id of identifiers){
    if(!id)continue;
    const strong=/^(?:[A-Z]{2,12}-[A-Za-z0-9-]+|c[a-z0-9]{20,}|[a-f0-9]{8}-[a-f0-9-]{27,})$/.test(id);
    if(text===id&&(strong||(idField(key)&&/(user|sender|recipient|owner|publicId|uid)/i.test(key))))return true;
    if(strong&&new RegExp(`(^|[^A-Za-z0-9_-])${escape(id)}($|[^A-Za-z0-9_-])`).test(text))return true;
    if(new RegExp(`(?:user:|/users/|userId=|publicId=)${escape(id)}($|[^A-Za-z0-9_-])`).test(text))return true;
  }
  return false;
}

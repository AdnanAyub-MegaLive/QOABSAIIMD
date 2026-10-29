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

// Compile once per identifier generation, rather than once per cell/row.
export function databaseReferenceMatcher(identifiers) {
  const ids = new Set(identifiers);
  const patterns = [...ids].filter(Boolean).map(id => {
    const strong = /^(?:[A-Z]{2,12}-[A-Za-z0-9-]+|c[a-z0-9]{20,}|[a-f0-9]{8}-[a-f0-9-]{27,})$/.test(id);
    return { id, strong, boundary: strong ? new RegExp(`(^|[^A-Za-z0-9_-])${escape(id)}($|[^A-Za-z0-9_-])`) : null, explicit: new RegExp(`(?:user:|/users/|userId=|publicId=)${escape(id)}($|[^A-Za-z0-9_-])`) };
  });
  function matches(value, key = '') {
    if (value == null) return false;
    if (Array.isArray(value)) return value.some(item => matches(item, key));
    if (typeof value === 'object') return Object.entries(value).some(([field, item]) => ids.has(field) || matches(item, field));
    if (!['string', 'number'].includes(typeof value)) return false;
    let text = String(value); try { text = decodeURIComponent(text); } catch {}
    return patterns.some(p => (text === p.id && (p.strong || (idField(key) && /(user|sender|recipient|owner|publicId|uid)/i.test(key)))) || p.boundary?.test(text) || p.explicit.test(text));
  }
  return matches;
}

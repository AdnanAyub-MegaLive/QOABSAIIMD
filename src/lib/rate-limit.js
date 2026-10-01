const globalForRateLimit=globalThis;
const buckets=globalForRateLimit.portalRateLimitBuckets??new Map();

if(process.env.NODE_ENV!=="production")globalForRateLimit.portalRateLimitBuckets=buckets;

export function isRateLimited(key,{limit,windowMs}){
  const now=Date.now();
  const timestamps=(buckets.get(key)??[]).filter((timestamp)=>now-timestamp<windowMs);
  timestamps.push(now);
  buckets.set(key,timestamps);

  if(buckets.size>10000){
    for(const [bucketKey,bucketTimestamps] of buckets){
      if(!bucketTimestamps.some((timestamp)=>now-timestamp<windowMs))buckets.delete(bucketKey);
    }
  }

  return timestamps.length>limit;
}

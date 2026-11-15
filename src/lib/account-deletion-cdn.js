import { readFileSync, statSync } from 'node:fs';
import { spacesConfig } from './media-cdn.js';
const failure = code => Object.assign(new Error('CDN deletion needs retry or configuration review.'), {code});

export function deletionCdnEnvironment(env=process.env) {
  if (env.DO_CDN_PURGE_TOKEN && env.DO_CDN_ENDPOINT_ID) return env;
  if (env.NODE_ENV!=='production' && !env.ACCOUNT_DELETION_CDN_ENV_FILE) return env;
  const path=env.ACCOUNT_DELETION_CDN_ENV_FILE || '/etc/megalive/account-deletion-cdn.env';
  try {
    const stat=statSync(path);
    if (!stat.isFile() || (stat.mode & 0o077)) throw failure('CDN_CREDENTIAL_PERMISSIONS');
    const values={};
    for (const line of readFileSync(path,'utf8').split('\n')) {
      const at=line.indexOf('=');const key=line.slice(0,at);
      if(['DO_CDN_PURGE_TOKEN','DO_CDN_ENDPOINT_ID'].includes(key))values[key]=line.slice(at+1).trim();
    }
    return {...env,...values};
  } catch(error) {
    if(error.code==='ENOENT')return env;
    throw failure('CDN_CREDENTIAL_UNAVAILABLE');
  }
}

// Accept only a single application-owned object. Never allow an endpoint delete,
// entire-bucket purge, user-supplied host, or arbitrary wildcard.
export function deletionCachePaths(key) {
  if (!/^(portal-media\/[a-zA-Z0-9_-]+\/(?:poster-)?[a-f0-9]{64}\.(?:png|jpg|webp|gif|mp4|svga)|room-banners\/[a-zA-Z0-9_-]+\.webp)$/.test(key))
    throw failure('INVALID_CDN_OBJECT');
  return [key, `${key}?*`];
}
export async function purgeDeletionCdn(keys, {env=deletionCdnEnvironment(), fetcher=fetch, config=spacesConfig(env)}={}) {
  const files=[...new Set(keys.flatMap(deletionCachePaths))];
  if (!files.length) return;
  if (files.length>50) throw failure('CDN_BATCH_TOO_LARGE');
  const id=env.DO_CDN_ENDPOINT_ID, token=env.DO_CDN_PURGE_TOKEN;
  if (!config || !/^[a-f0-9-]{36}$/.test(id||'') || !token) throw failure('CDN_PURGE_NOT_CONFIGURED');
  const url=`https://api.digitalocean.com/v2/cdn/endpoints/${id}`;
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const detail=await fetcher(url,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
  if (!detail.ok) throw failure('CDN_LOOKUP_FAILED');
  const {endpoint}=await detail.json();
  if (endpoint?.origin!==`${config.bucket}.${new URL(config.endpoint).hostname}` || endpoint?.custom_domain!==new URL(config.base).hostname)
    throw failure('CDN_ENDPOINT_MISMATCH');
  const result=await fetcher(`${url}/cache`,{method:'DELETE',headers,body:JSON.stringify({files}),signal:AbortSignal.timeout(15000),redirect:'error'});
  if (result.status!==204) throw failure(result.status===429?'CDN_RATE_LIMITED':'CDN_PURGE_FAILED');
}

export function deletionObjectKey(url, base='https://media.megachat.live') {
  const parsed=new URL(url);
  if(parsed.origin!==new URL(base).origin || parsed.username || parsed.password || parsed.hash) throw failure('UNREVIEWED_MEDIA_ORIGIN');
  const key=parsed.pathname.slice(1);deletionCachePaths(key);return key;
}
export async function deletePublicDeletionObject(key, {env=deletionCdnEnvironment(), config=spacesConfig(env)}={}) {
  deletionCachePaths(key);
  if(!config || !env.DO_CDN_PURGE_TOKEN || !env.DO_CDN_ENDPOINT_ID) throw failure('CDN_PURGE_NOT_CONFIGURED');
  const {S3Client,DeleteObjectCommand,GetBucketVersioningCommand}=await import('@aws-sdk/client-s3');
  const client=new S3Client({endpoint:config.endpoint,region:'us-east-1',credentials:config.credentials,maxAttempts:2,requestChecksumCalculation:'WHEN_REQUIRED'});
  try {
    const version=await client.send(new GetBucketVersioningCommand({Bucket:config.bucket}),{abortSignal:AbortSignal.timeout(15000)});
    if(version.Status)throw failure('VERSIONED_MEDIA_REVIEW');
    await client.send(new DeleteObjectCommand({Bucket:config.bucket,Key:key}),{abortSignal:AbortSignal.timeout(15000)});
    await purgeDeletionCdn([key],{env,config});
  } finally {client.destroy();}
}

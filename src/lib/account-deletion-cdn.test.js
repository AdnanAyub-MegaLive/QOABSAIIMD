import {expect,it,vi} from 'vitest';
import {deletionCachePaths,purgeDeletionCdn} from './account-deletion-cdn.js';
const key=`portal-media/AVATAR-X/${'a'.repeat(64)}.webp`;
const config={bucket:'example',endpoint:'https://sgp1.digitaloceanspaces.com',base:'https://media.example.com'};
const env={DO_CDN_ENDPOINT_ID:'225e53f9-a066-4b56-b533-e07f26c3757c',DO_CDN_PURGE_TOKEN:'test-secret'};
it('rejects broad purges, unrelated prefixes and traversal',()=>{
 for(const value of ['*','portal-media/*','../secret','https://example.com/x','room-banners/../x.webp'])expect(()=>deletionCachePaths(value)).toThrow();
 expect(deletionCachePaths(key)).toEqual([key,key+'?*']);
});
it('only deletes the cache subresource for the configured endpoint',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({endpoint:{origin:'example.sgp1.digitaloceanspaces.com',custom_domain:'media.example.com'}})}).mockResolvedValueOnce({status:204});
 await purgeDeletionCdn([key],{env,config,fetcher});
 const [url,options]=fetcher.mock.calls[1];expect(url).toBe(`https://api.digitalocean.com/v2/cdn/endpoints/${env.DO_CDN_ENDPOINT_ID}/cache`);expect(options.method).toBe('DELETE');expect(JSON.parse(options.body).files).toEqual([key,key+'?*']);
});
it('refuses a different bucket before any mutation',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({endpoint:{origin:'other.sgp1.digitaloceanspaces.com',custom_domain:'media.example.com'}})});
 await expect(purgeDeletionCdn([key],{env,config,fetcher})).rejects.toMatchObject({code:'CDN_ENDPOINT_MISMATCH'});expect(fetcher).toHaveBeenCalledTimes(1);
});

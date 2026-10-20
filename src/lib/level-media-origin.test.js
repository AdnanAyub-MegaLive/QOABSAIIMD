import {afterEach,expect,it,vi} from 'vitest';
import {levelMediaOrigin,levelTagBackgrounds} from './level-tag-backgrounds.js';
afterEach(()=>vi.unstubAllEnvs());
it('resolves absent and literal null origins from canonical configuration',()=>{
 vi.stubEnv('MOBILE_API_BASE_URL','https://portal.example/');
 expect(levelMediaOrigin(null)).toBe('https://portal.example');
 expect(levelMediaOrigin('null')).toBe('https://portal.example');
 expect(levelMediaOrigin('https://request.example/path')).toBe('https://request.example');
});
it('rejects invalid protocols and credentials, falling back to AUTH_URL',()=>{
 vi.stubEnv('MOBILE_API_BASE_URL','null');vi.stubEnv('AUTH_URL','https://portal.example');
 expect(levelMediaOrigin('file:///tmp')).toBe('https://portal.example');
 expect(levelMediaOrigin('https://user:password@host')).toBe('https://portal.example');
});
it('returns no optional artwork when there is no valid host',async()=>{
 vi.stubEnv('MOBILE_API_BASE_URL','');vi.stubEnv('AUTH_URL','');
 const findMany=vi.fn();
 expect(await levelTagBackgrounds({levelTagBackground:{findMany}},null)).toEqual(new Map());
 expect(findMany).not.toHaveBeenCalled();
});
it('builds signed versioned artwork URLs with a resolved canonical origin',async()=>{
 vi.stubEnv('MOBILE_API_BASE_URL','https://portal.example');vi.stubEnv('AUTH_SECRET','test-only-secret');
 const db={levelTagBackground:{findMany:async()=>[{track:'AGENCY',level:1,asset:{publicId:'AST-1',mimeType:'image/png',mediaVersion:'abcd'}}]}};
 const media=(await levelTagBackgrounds(db,levelMediaOrigin(null))).get('AGENCY:1');
 const url=new URL(media.url);expect(url.origin).toBe('https://portal.example');expect(url.searchParams.get('v')).toBe('abcd');expect(url.searchParams.get('displaySig')).toBeTruthy();
});

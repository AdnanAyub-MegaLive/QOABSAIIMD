import {expect,it} from 'vitest';
import origin from './internal-server-origin.cjs';
const {internalServerOrigin}=origin;
it.each([['0.0.0.0','http://127.0.0.1:3000'],['::','http://[::1]:3000'],['127.0.0.1','http://127.0.0.1:3000'],['localhost','http://localhost:3000']])('uses the actual HTTP listener for %s',(host,want)=>expect(internalServerOrigin(host,3000)).toBe(want));
it.each([0,NaN,65536,3.5])('rejects invalid port %s',port=>expect(()=>internalServerOrigin('localhost',port)).toThrow());
it('does not allow credentials or path injection',()=>expect(()=>internalServerOrigin('evil@localhost/path',3000)).toThrow());

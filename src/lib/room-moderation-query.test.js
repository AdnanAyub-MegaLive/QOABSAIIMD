import {it,expect} from 'vitest';
import {moderationFilters} from './room-moderation-query';
it('defaults to all rooms and all history',()=>{expect(moderationFilters(new URLSearchParams())).toMatchObject({type:'ALL',status:'ALL',page:1,q:''});});
it('includes the entire UTC end date',()=>{const f=moderationFilters(new URLSearchParams('type=BAN&status=REVOKED&from=2026-10-01&to=2026-10-22&page=5&q=ROOM-1'));expect(f.to.toISOString()).toBe('2026-10-23T00:00:00.000Z');expect(f.page).toBe(5);});
it.each(['type=OTHER','status=BAD','page=-1','page=1.5','from=bad','from=2026-12-01&to=2026-01-01'])('rejects invalid filters %s',query=>{expect(()=>moderationFilters(new URLSearchParams(query))).toThrow('Invalid moderation filters');});

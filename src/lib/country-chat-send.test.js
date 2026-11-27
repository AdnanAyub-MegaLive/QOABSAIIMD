import { describe, it, expect, vi } from 'vitest';
const mocks=vi.hoisted(()=>({ membership:vi.fn(), create:vi.fn() }));
vi.mock('./prisma.js',()=>({prisma:{vipMembership:{findUnique:mocks.membership},message:{create:mocks.create}}}));
vi.mock('./user-blocks.js',()=>({assertConversationMessagingAllowed:vi.fn(),listBlockedUserIds:vi.fn()}));
import { createMessage } from './messaging.js';
describe('shared HTTP and Socket.IO Country Chat send boundary',()=>{
 it('rejects a non-VIP before creating a message, including a retry identifier',async()=>{
  mocks.membership.mockResolvedValue(null);
  await expect(createMessage({kind:'WORLD',id:'world'},{id:'user'},'hello',null,{clientMessageId:'retry'})).rejects.toMatchObject({code:'COUNTRY_CHAT_VIP_REQUIRED'});
  expect(mocks.create).not.toHaveBeenCalled();
 });
});

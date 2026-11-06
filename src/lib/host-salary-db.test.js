import {it,expect,vi} from 'vitest';
import {prisma} from './prisma.js';
import {hostCenter} from './host-center.js';
import {closeHostSalaryCycle} from './host-salary-close.js';
import {agencyWorkReports} from './agency-work.js';
import {moduleCycle} from './reporting-cycles.js';
import {createCurrencyRequest} from './currency-operations.js';
import {issueWithdrawalQuote} from './withdrawal-contract.js';
import {hostWithdrawalPolicy} from './host-salary.js';

it.skipIf(process.env.HOST_SALARY_QA!=='1')('closes an isolated cycle once and preserves exchanged earnings, agency allocation, diamonds and timed VIP',async()=>{
  const database=new URL(process.env.DATABASE_URL);
  if(!['127.0.0.1','localhost','[::1]'].includes(database.hostname) || !/^\/salary_qa_\d+$/.test(database.pathname))throw Error('Disposable local salary QA database required');
  const db=prisma;
  const control=await db.hostSalaryControl.findFirstOrThrow();
  const period=await moduleCycle(db,'HOST_SALARY',control.nextCloseStart);
  const agency=await db.agency.create({data:{publicId:'QA-agency',name:'QA Agency'}});
  const user=await db.user.create({data:{publicId:'QA-host',name:'QA Host',appRoles:['HOST'],agencyId:agency.id}});
  const sender=await db.user.create({data:{publicId:'QA-sender',name:'QA Sender'}});
  await db.vipTier.create({data:{level:1,name:'VIP-1',validDays:30}});
  const at=new Date(+period.start+60000);
  for(const [recipientType,amount,reversed] of [['HOST',5500000n,false],['NORMAL_USER',500000n,false],['HOST',3000000n,true]]) {
    const gift=await db.giftTransaction.create({data:{senderId:sender.id,recipientUserId:user.id,giftName:'QA',coinValue:amount,createdAt:at,reversedAt:reversed?at:null}});
    await db.giftSettlement.create({data:{giftTransactionId:gift.id,createdAt:at,agencyId:agency.id,recipientType,grossCoins:amount,recipientDiamonds:amount,hostShareBps:0,agencyShareBps:0,companyShareBps:0,reusableShareBps:0,policyVersion:1}});
  }
  const before=await hostCenter(db,user.id,period.key,at);
  expect(before.journey).toMatchObject({level:5,earned:'5500000',available:'0',remaining:'2600000',currentUsd:'60.00'});
  await hostWithdrawalPolicy(db,user,{rules:{}});
  const [agencyReport]=await agencyWorkReports(db,[agency],period);
  expect(agencyReport.work.salaryUsd).toBe('2.40');
  vi.stubEnv('AUTH_SECRET','local-salary-qa');
  await db.currencyPolicy.create({data:{rules:{withdrawalDiamondsPerUsd:'90000',usdtEnabled:true,usdtMicrosPerUsd:'1000000',
    withdrawalMinDiamonds:'1800000',withdrawalMaxDiamonds:'90000000',feeBearer:'COMPANY',commissionChart:[{minUsdMicros:'0',bps:'0',fixedUsdtMicros:'0',networkUsdtMicros:'0'}]}}});
  await db.user.update({where:{id:user.id},data:{hostSalaryCoinBalance:1000000n}});
  const destination='T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
  const quote=issueWithdrawalQuote({userId:user.id,diamonds:'1000000',destination,policyVersion:1});
  const input={kind:'USDT',diamonds:'1000000',destination,policyVersion:1,...quote};
  const reserved=await createCurrencyRequest(db,user.id,input,'salary-qa-withdraw');
  expect(reserved.netUsdtMicros).toBe('11111111');
  await createCurrencyRequest(db,user.id,input,'salary-qa-withdraw');
  expect((await db.user.findUniqueOrThrow({where:{id:user.id}})).hostSalaryCoinBalance).toBe(0n);
  vi.unstubAllEnvs();
  await closeHostSalaryCycle(db,period.end);
  await closeHostSalaryCycle(db,period.end);
  expect(await db.hostSalaryAward.count()).toBe(1);
  expect(await db.walletTransaction.count({where:{type:'HOST_SALARY_REWARD'}})).toBe(1);
  expect((await db.user.findUniqueOrThrow({where:{id:user.id}})).hostSalaryCoinBalance).toBe(150000n);
  expect((await db.vipOwnership.findFirstOrThrow()).expiresAt.getTime()).toBe(+period.end+3*86400000);
},30000);

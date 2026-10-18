import {expect,it} from 'vitest';
import {targetReports} from './management-target-report.js';
it('reports direct or descendant agency topups without double counting or paying salary',()=>{
 const people=[{id:'a',publicId:'A',appRoles:['ADMIN']},{id:'b',publicId:'B',supervisorUserId:'a',appRoles:['BD']}];
 const rules=[{role:'ADMIN',scope:'SUBTREE',targetCoins:'100',salaryCurrency:'USD',salaryAmount:'20'},{role:'BD',scope:'OWN',targetCoins:'200',salaryCurrency:'USD',salaryAmount:'10'}];
 const result=targetReports(people,[{id:'agency',bdUserId:'b'}],[{agencyId:'agency',coins:150n}],rules);
 expect(result.get('A')).toMatchObject({progressCoins:'150',projectedSalary:'20',salaryStatus:'ESTIMATE_NOT_A_PAYMENT'});
 expect(result.get('B')).toMatchObject({remainingCoins:'50',projectedSalary:'0'});
 expect(targetReports(people,[],[],[]).get('A')).toBeNull();
});

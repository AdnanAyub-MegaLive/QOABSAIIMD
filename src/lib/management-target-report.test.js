import {expect,it} from 'vitest';
import {targetReports} from './management-target-report.js';
it('counts only direct agency Diamonds, never descendant production',()=>{
 const people=[{id:'a',publicId:'A',appRoles:['JUNIOR_ADMIN']},{id:'b',publicId:'B',supervisorUserId:'a',appRoles:['BD']}];
 const agencies=[{bdUserId:'a',work:{totalDiamonds:'2700000000'}},{bdUserId:'b',work:{totalDiamonds:'450000000'}}];
 const rules=[{role:'JUNIOR_ADMIN',targetDiamonds:'2000000000',salaryCurrency:'USD',salaryAmount:'20'},{role:'BD',targetDiamonds:'500000000',salaryCurrency:'USD',salaryAmount:'10'}];
 const result=targetReports(people,agencies,rules);
 expect(result.get('A')).toMatchObject({progressDiamonds:'2700000000',projectedSalary:'20',scope:'OWN',salaryStatus:'ESTIMATE_NOT_A_PAYMENT'});
 expect(result.get('B')).toMatchObject({remainingDiamonds:'50000000',projectedSalary:'0'});
 expect(targetReports(people,agencies,[{role:'BD',targetCoins:'1'}]).get('B')).toMatchObject({configured:false,projectedSalary:null});
});

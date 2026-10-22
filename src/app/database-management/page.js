import {redirect} from 'next/navigation';
import {requirePortalAdmin} from '@/lib/portal-admin';
import {isDatabaseOwner} from '@/lib/database-management-access';
import PortalSidebar from '../components/portal-sidebar';
import DatabaseManager from './database-manager';
export default async function Page(){
 if(!isDatabaseOwner(await requirePortalAdmin()))redirect('/access-denied');
 return <main className="min-h-screen bg-slate-50"><PortalSidebar/><section className="mx-auto max-w-7xl p-8 lg:pl-72"><h1 className="text-2xl font-bold">DataBase Management</h1><DatabaseManager/></section></main>;
}

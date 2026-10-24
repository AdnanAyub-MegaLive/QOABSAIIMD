import Link from 'next/link';
import ProfileCovers from './profile-covers';
import { requirePagePermission } from '@/lib/portal-admin';
import RoomManagementShell from '../components/room-management-shell';
import { prisma } from '@/lib/prisma';
import { loadSocialReview, socialFilters, socialReviewUrl } from '@/lib/social-review';

function Controls({kind,title,filters,page,pages,total}) {
  const queryKey=`${kind}Q`,pageKey=`${kind}Page`;
  return <>
    <form action={`/content-moderation#${kind}`} method="get" className="my-3 flex flex-wrap gap-2">
      {Object.entries(filters).filter(([key])=>key!==queryKey&&key!==pageKey).map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}
      <label className="flex flex-col gap-1 text-sm">Search {title}<input key={filters[queryKey]} type="search" name={queryKey} defaultValue={filters[queryKey]} maxLength={120} placeholder="Name or public ID" className="rounded border p-2"/></label>
      <button className="self-end rounded bg-teal-700 px-3 py-2 text-white">Search</button>
      <Link className="self-end p-2 underline" href={socialReviewUrl(filters,{[queryKey]:'',[pageKey]:1},kind)}>Clear</Link>
    </form>
    <nav aria-label={`${title} pagination`} className="flex flex-wrap items-center gap-3 text-sm">
      <span>{total} matching records · Page {page} of {pages}</span>
      {page>1?<Link className="underline" href={socialReviewUrl(filters,{[pageKey]:page-1},kind)}>Previous</Link>:<span aria-disabled="true">Previous</span>}
      {page<pages?<Link className="underline" href={socialReviewUrl(filters,{[pageKey]:page+1},kind)}>Next</Link>:<span aria-disabled="true">Next</span>}
    </nav>
  </>;
}
const identity=user=><>{user.name} <span className="text-xs text-slate-500">({user.publicId})</span></>;
export default async function ContentModerationPage({searchParams}) {
  await requirePagePermission('content.view');
  const filters=socialFilters(await searchParams);
  const [posts,data]=await Promise.all([prisma.post.findMany({include:{author:{select:{publicId:true,name:true}}},orderBy:{createdAt:'desc'},take:100}),loadSocialReview(prisma,filters)]);
  const current={...filters,blocksPage:data.blocksPage,friendsPage:data.friendsPage};
  return <RoomManagementShell title="Content & Social Safety"><div className="space-y-7">
    <ProfileCovers/>
    <div><h2 className="text-2xl font-bold">Social activity review</h2><p className="mt-1 text-sm text-slate-500">Read-only records. Search either person by name or public ID. All friend requests and block relationships are available through pagination.</p></div>
    <section className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Recent posts (latest 100)</h3><div className="mt-3 divide-y">{posts.map(p=><div key={p.publicId} className="py-3 text-sm"><b>{p.author.name}</b> <span>{p.author.publicId} · {p.publicId}</span><p>{p.description||'Image post'}</p></div>)}{!posts.length&&<p>No posts.</p>}</div></section>
    <div className="grid gap-5 lg:grid-cols-2">
      <section id="blocks" className="rounded-2xl border bg-white p-5"><h3 className="font-bold">User block relationships</h3>
        <Controls kind="blocks" title="blocked users" filters={current} page={data.blocksPage} pages={data.blockPages} total={data.blockTotal}/>
        <div className="mt-3 divide-y">{data.blocks.map(b=><p key={`${b.blocker.publicId}:${b.blocked.publicId}`} className="py-3 text-sm">{identity(b.blocker)} blocked {identity(b.blocked)}<br/><time>{b.createdAt.toISOString()} (UTC)</time></p>)}{!data.blocks.length&&<p className="py-6">No matching user blocks.</p>}</div>
      </section>
      <section id="friends" className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Friend requests</h3>
        <Controls kind="friends" title="friend requests" filters={current} page={data.friendsPage} pages={data.friendPages} total={data.friendTotal}/>
        <div className="mt-3 divide-y">{data.requests.map(r=><p key={r.publicId} className="py-3 text-sm">{identity(r.requester)} → {identity(r.addressee)}<br/><span>{r.publicId} · {r.status}</span><br/><time>{r.createdAt.toISOString()} (UTC)</time></p>)}{!data.requests.length&&<p className="py-6">No matching friend requests.</p>}</div>
      </section>
    </div>
  </div></RoomManagementShell>;
}

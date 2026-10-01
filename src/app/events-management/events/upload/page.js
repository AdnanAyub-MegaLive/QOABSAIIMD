import { prisma } from "../../../../lib/prisma.js";
import EventUploadForm from "./upload-form.js";

export default async function UploadEventPage({ searchParams }) {
  const eventId = (await searchParams).event;
  const event = eventId
    ? await prisma.event.findFirst({
        where: { OR: [{ id: eventId }, { publicId: eventId }] },
        select: { id: true, name: true, slug: true, latestVersion: true },
      })
    : null;
  return <><h2 className="text-3xl font-black">{event ? `Upload version ${event.latestVersion + 1}` : "Upload Event"}</h2><p className="mt-1 text-slate-500">{event ? `Replacing the active files for ${event.name}; older versions remain available.` : "Create a hosted event from a folder, ZIP, or RAR archive."}</p><EventUploadForm event={event} /></>;
}

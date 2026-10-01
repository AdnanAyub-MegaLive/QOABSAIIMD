import { randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import { EventModuleError } from "./errors.js";
import { writeEventLog } from "./logger.js";
import {
  filesFromFormData,
  persistEventVersion,
  removeStoredEvent,
  removeStoredVersion,
} from "./storage.js";

const eventInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  versions: {
    include: { createdBy: { select: { name: true, email: true } } },
    orderBy: { version: "desc" },
  },
};

export function serializeEvent(event) {
  return {
    ...event,
    versions: event.versions?.map((version) => ({
      ...version,
      sizeBytes: version.sizeBytes.toString(),
    })),
    publicUrl:
      event.status === "PUBLISHED" ? `/event/${encodeURIComponent(event.slug)}` : null,
  };
}

function publicId() {
  return `EVT-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export async function listEvents({ search, status, uploaderId } = {}) {
  const where = {
    ...(status ? { status } : {}),
    ...(uploaderId ? { createdById: uploaderId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const records = await prisma.event.findMany({
    where,
    include: eventInclude,
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return records.map(serializeEvent);
}

export async function getEvent(id) {
  const event = await prisma.event.findFirst({
    where: { OR: [{ id }, { publicId: id }] },
    include: eventInclude,
  });
  if (!event) throw new EventModuleError("EVENT_NOT_FOUND", "Event not found.", 404);
  return event;
}

export async function createEventWithUpload({ metadata, formData, user, ip }) {
  const existing = await prisma.event.findUnique({ where: { slug: metadata.slug } });
  if (existing)
    throw new EventModuleError("SLUG_EXISTS", "That event slug is already in use.", 409);
  const prepared = await filesFromFormData(formData);
  const eventId = publicId();
  const folderName = `${metadata.slug}-${eventId.slice(-6).toLowerCase()}`;
  const stored = await persistEventVersion({
    folderName,
    version: 1,
    ...prepared,
  });
  try {
    const event = await prisma.event.create({
      data: {
        publicId: eventId,
        name: metadata.name,
        slug: metadata.slug,
        folderName,
        entryFile: stored.entryFile,
        createdById: user.id,
        versions: {
          create: {
            version: 1,
            folderName: stored.folderName,
            entryFile: stored.entryFile,
            fileCount: stored.fileCount,
            sizeBytes: stored.sizeBytes,
            checksum: stored.checksum,
            createdById: user.id,
          },
        },
      },
      include: eventInclude,
    });
    await writeEventLog({
      userId: user.id,
      eventId: event.id,
      action: "UPLOAD",
      ip,
      upload: true,
      metadata: { version: 1, slug: event.slug, fileCount: stored.fileCount },
    });
    return serializeEvent(event);
  } catch (error) {
    await removeStoredVersion(stored.folderName);
    throw error;
  }
}

export async function uploadNewVersion({ id, formData, user, ip }) {
  const event = await getEvent(id);
  const prepared = await filesFromFormData(formData);
  const version = event.latestVersion + 1;
  const stored = await persistEventVersion({
    folderName: event.folderName,
    version,
    ...prepared,
  });
  try {
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        latestVersion: version,
        version,
        entryFile: stored.entryFile,
        versions: {
          create: {
            version,
            folderName: stored.folderName,
            entryFile: stored.entryFile,
            fileCount: stored.fileCount,
            sizeBytes: stored.sizeBytes,
            checksum: stored.checksum,
            createdById: user.id,
          },
        },
      },
      include: eventInclude,
    });
    await writeEventLog({
      userId: user.id,
      eventId: event.id,
      action: "UPLOAD_NEW_VERSION",
      ip,
      upload: true,
      metadata: { version, fileCount: stored.fileCount },
    });
    return serializeEvent(updated);
  } catch (error) {
    await removeStoredVersion(stored.folderName);
    throw error;
  }
}

export async function changeEventStatus({ id, status, user, ip }) {
  const event = await getEvent(id);
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: {
      status,
      publishedAt: status === "PUBLISHED" ? new Date() : event.publishedAt,
    },
    include: eventInclude,
  });
  const action =
    status === "PUBLISHED"
      ? "PUBLISH"
      : status === "ARCHIVED"
        ? "ARCHIVE"
        : "UNPUBLISH";
  await writeEventLog({
    userId: user.id,
    eventId: event.id,
    action,
    ip,
    publish: true,
    metadata: { version: updated.version },
  });
  return serializeEvent(updated);
}

export async function rollbackEvent({ id, version, user, ip }) {
  const event = await getEvent(id);
  const target = event.versions.find((item) => item.version === version);
  if (!target)
    throw new EventModuleError("VERSION_NOT_FOUND", "That event version does not exist.", 404);
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { version, entryFile: target.entryFile },
    include: eventInclude,
  });
  await writeEventLog({
    userId: user.id,
    eventId: event.id,
    action: "ROLLBACK",
    ip,
    metadata: { fromVersion: event.version, toVersion: version },
  });
  return serializeEvent(updated);
}

export async function deleteEvent({ id, user, ip }) {
  const event = await getEvent(id);
  await writeEventLog({
    userId: user.id,
    eventId: event.id,
    action: "DELETE",
    ip,
    metadata: { slug: event.slug, version: event.version },
  });
  await prisma.event.delete({ where: { id: event.id } });
  await removeStoredEvent(event.folderName);
}

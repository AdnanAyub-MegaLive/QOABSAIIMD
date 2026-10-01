import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import unzipper from "unzipper";
import { createExtractorFromData } from "node-unrar-js";
import { fileTypeFromBuffer } from "file-type";
import { getEventConfig } from "./config.js";
import { EventModuleError } from "./errors.js";

export const ALLOWED_EVENT_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".mp4",
  ".webm",
  ".mp3",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);

const ARCHIVE_EXTENSIONS = new Set([".zip", ".rar"]);
const TEXT_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".json",
  ".svg",
]);
const EXPECTED_MIME_PREFIXES = {
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".gif": ["image/gif"],
  ".mp4": ["video/mp4"],
  ".webm": ["video/webm", "audio/webm"],
  ".mp3": ["audio/mpeg"],
  ".woff": ["font/woff", "application/font-woff"],
  ".woff2": ["font/woff2"],
  ".ttf": ["font/ttf", "application/x-font-ttf"],
  ".otf": ["font/otf", "application/x-font-opentype"],
};

export function eventStoragePaths() {
  const configured = getEventConfig().storageRoot;
  const permanentRoot = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    configured,
  );
  const tempRoot = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "storage",
    "tmp",
  );
  return { permanentRoot, tempRoot };
}

export function normalizeEventPath(input) {
  const raw = String(input ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!raw || raw.includes("\0"))
    throw new EventModuleError("INVALID_STRUCTURE", "An uploaded path is invalid.", 422);
  const parts = raw.split("/").filter(Boolean);
  if (
    parts.length > 32 ||
    parts.some((part) => part === "." || part === ".." || part.length > 180)
  )
    throw new EventModuleError(
      "PATH_TRAVERSAL",
      "The upload contains an unsafe file path.",
      422,
    );
  return parts.join("/");
}

function assertInside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`))
    throw new EventModuleError(
      "PATH_TRAVERSAL",
      "The upload attempted to escape event storage.",
      422,
    );
  return resolved;
}

function allowedExtension(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EVENT_EXTENSIONS.has(extension))
    throw new EventModuleError(
      "UNSUPPORTED_FILE_TYPE",
      `Unsupported event file: ${filePath}`,
      422,
    );
  return extension;
}

async function validateContent(filePath, buffer) {
  const extension = allowedExtension(filePath);
  if (TEXT_EXTENSIONS.has(extension)) {
    if (buffer.includes(0))
      throw new EventModuleError(
        "MIME_MISMATCH",
        `The contents of ${filePath} do not match its extension.`,
        422,
      );
    if (extension === ".json") {
      try {
        JSON.parse(buffer.toString("utf8"));
      } catch {
        throw new EventModuleError(
          "INVALID_JSON",
          `${filePath} contains invalid JSON.`,
          422,
        );
      }
    }
    return;
  }
  const detected = await fileTypeFromBuffer(buffer);
  const expected = EXPECTED_MIME_PREFIXES[extension] ?? [];
  if (!detected || !expected.includes(detected.mime))
    throw new EventModuleError(
      "MIME_MISMATCH",
      `The contents of ${filePath} do not match its extension.`,
      422,
    );
}

function stripSingleWrapper(files) {
  if (files.some((file) => file.path.toLowerCase() === "index.html")) return files;
  const roots = new Set(files.map((file) => file.path.split("/")[0]));
  if (roots.size !== 1) return files;
  const [root] = roots;
  return files.map((file) => ({
    ...file,
    path: normalizeEventPath(file.path.slice(root.length + 1)),
  }));
}

async function validateFiles(inputFiles) {
  const config = getEventConfig();
  if (!inputFiles.length)
    throw new EventModuleError("EMPTY_UPLOAD", "The uploaded folder is empty.", 422);
  if (inputFiles.length > config.maxFiles)
    throw new EventModuleError(
      "TOO_MANY_FILES",
      `Events may contain at most ${config.maxFiles} files.`,
      413,
    );

  const files = stripSingleWrapper(
    inputFiles.map((file) => ({
      path: normalizeEventPath(file.path),
      data: Buffer.from(file.data),
    })),
  );
  const seen = new Set();
  let totalBytes = 0;
  for (const file of files) {
    const key = file.path.toLowerCase();
    if (seen.has(key))
      throw new EventModuleError(
        "DUPLICATE_FILE",
        `The upload contains duplicate path ${file.path}.`,
        422,
      );
    seen.add(key);
    totalBytes += file.data.byteLength;
    if (totalBytes > config.maxExtractedBytes)
      throw new EventModuleError(
        "EXTRACTED_TOO_LARGE",
        "The extracted event exceeds the configured size limit.",
        413,
      );
    await validateContent(file.path, file.data);
  }
  if (!seen.has("index.html"))
    throw new EventModuleError(
      "INDEX_MISSING",
      "The event must contain index.html at its root.",
      422,
    );
  return { files, totalBytes };
}

async function extractZip(buffer) {
  let directory;
  try {
    directory = await unzipper.Open.buffer(buffer);
  } catch {
    throw new EventModuleError("INVALID_ARCHIVE", "The ZIP archive is invalid.", 422);
  }
  const entries = directory.files.filter((entry) => entry.type === "File");
  const config = getEventConfig();
  const declaredBytes = entries.reduce(
    (sum, entry) => sum + Number(entry.vars?.uncompressedSize || 0),
    0,
  );
  if (entries.length > config.maxFiles || declaredBytes > config.maxExtractedBytes)
    throw new EventModuleError(
      "ARCHIVE_LIMIT_EXCEEDED",
      "The archive declares more files or extracted data than allowed.",
      413,
    );
  return entries.map(async (entry) => ({
      path: entry.path,
      data: await entry.buffer(),
    }));
}

async function extractRar(buffer) {
  try {
    const extractor = await createExtractorFromData({
      data: Uint8Array.from(buffer).buffer,
    });
    const listing = extractor.getFileList();
    const headers = [...listing.fileHeaders];
    const config = getEventConfig();
    const filesOnly = headers.filter((header) => !header.flags.directory);
    const declaredBytes = filesOnly.reduce(
      (sum, header) => sum + Number(header.unpSize || 0),
      0,
    );
    if (
      filesOnly.length > config.maxFiles ||
      declaredBytes > config.maxExtractedBytes
    )
      throw new EventModuleError(
        "ARCHIVE_LIMIT_EXCEEDED",
        "The archive declares more files or extracted data than allowed.",
        413,
      );
    const extracted = extractor.extract();
    const files = [...extracted.files];
    return files
      .filter((file) => !file.fileHeader.flags.directory)
      .map((file) => ({
        path: file.fileHeader.name,
        data: Buffer.from(file.extraction),
      }));
  } catch (error) {
    if (error instanceof EventModuleError) throw error;
    throw new EventModuleError("INVALID_ARCHIVE", "The RAR archive is invalid.", 422);
  }
}

export async function filesFromFormData(formData) {
  const archive = formData.get("archive");
  const config = getEventConfig();
  if (archive instanceof File && archive.size > 0) {
    if (archive.size > config.maxUploadBytes)
      throw new EventModuleError("FILE_TOO_LARGE", "The archive is too large.", 413);
    const extension = path.extname(archive.name).toLowerCase();
    if (!ARCHIVE_EXTENSIONS.has(extension))
      throw new EventModuleError(
        "UNSUPPORTED_ARCHIVE",
        "Only .zip and .rar archives are supported.",
        422,
      );
    const { tempRoot } = eventStoragePaths();
    await mkdir(tempRoot, { recursive: true });
    const archivePath = assertInside(
      tempRoot,
      path.join(tempRoot, `${randomUUID()}${extension}`),
    );
    await writeFile(archivePath, Buffer.from(await archive.arrayBuffer()), {
      flag: "wx",
    });
    try {
      const buffer = await readFile(archivePath);
      const extracted =
        extension === ".zip"
          ? await Promise.all(await extractZip(buffer))
          : await extractRar(buffer);
      return await validateFiles(extracted);
    } finally {
      await rm(archivePath, { force: true });
    }
  }

  const uploads = formData.getAll("files").filter((item) => item instanceof File);
  const paths = formData.getAll("paths").map(String);
  let receivedBytes = 0;
  const files = [];
  for (let index = 0; index < uploads.length; index += 1) {
    const file = uploads[index];
    receivedBytes += file.size;
    if (receivedBytes > config.maxUploadBytes)
      throw new EventModuleError("FILE_TOO_LARGE", "The folder upload is too large.", 413);
    files.push({
      path: paths[index] || file.webkitRelativePath || file.name,
      data: Buffer.from(await file.arrayBuffer()),
    });
  }
  return validateFiles(files);
}

export async function persistEventVersion({
  folderName,
  version,
  files,
  totalBytes,
}) {
  const { permanentRoot, tempRoot } = eventStoragePaths();
  await mkdir(tempRoot, { recursive: true });
  await mkdir(permanentRoot, { recursive: true });
  const stage = assertInside(tempRoot, path.join(tempRoot, randomUUID()));
  const relativeFolder = normalizeEventPath(`${folderName}/v${version}`);
  const destination = assertInside(permanentRoot, path.join(permanentRoot, relativeFolder));
  await mkdir(stage, { recursive: true });
  const digest = createHash("sha256");
  try {
    for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
      const output = assertInside(stage, path.join(stage, ...file.path.split("/")));
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, file.data, { flag: "wx" });
      digest.update(file.path);
      digest.update(file.data);
    }
    try {
      await access(destination);
      throw new EventModuleError(
        "VERSION_EXISTS",
        `Version ${version} already exists on disk.`,
        409,
      );
    } catch (error) {
      if (error instanceof EventModuleError) throw error;
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(stage, destination);
    return {
      folderName: relativeFolder,
      entryFile: "index.html",
      fileCount: files.length,
      sizeBytes: BigInt(totalBytes),
      checksum: digest.digest("hex"),
      absolutePath: destination,
    };
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

export async function removeStoredVersion(folderName) {
  const { permanentRoot } = eventStoragePaths();
  const target = assertInside(permanentRoot, path.join(permanentRoot, normalizeEventPath(folderName)));
  await rm(target, { recursive: true, force: true });
}

export async function removeStoredEvent(folderName) {
  const { permanentRoot } = eventStoragePaths();
  const target = assertInside(permanentRoot, path.join(permanentRoot, normalizeEventPath(folderName)));
  await rm(target, { recursive: true, force: true });
}

export async function resolvePublishedFile(folderName, requestedPath) {
  const { permanentRoot } = eventStoragePaths();
  const base = assertInside(permanentRoot, path.join(permanentRoot, normalizeEventPath(folderName)));
  const safePath = normalizeEventPath(requestedPath);
  const target = assertInside(base, path.join(base, ...safePath.split("/")));
  const details = await stat(target);
  if (!details.isFile()) throw new Error("Not a file");
  return { buffer: await readFile(target), details, extension: path.extname(target).toLowerCase() };
}

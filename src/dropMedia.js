/*
 * Photos and videos for a Live Drop, uploaded as files.
 *
 * A drop's media used to be typed in as links, which meant putting a file
 * somewhere first and copying its address back, and that is how the first
 * drop ran with no photo and a video of a backpack attached to a dog feeder.
 * The admin console now takes the file itself.
 *
 * Files are kept on the durable share, not in the app's own folder: a deploy
 * replaces that folder, and a drop's video disappearing at the next release
 * would be the same failure again. They are named by a random id, never by
 * what the uploader called them, and a file is only kept when its first bytes
 * say it really is the image or video it claims to be.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const isAzure = Boolean(process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_INSTANCE_ID);

function mediaDirectory() {
  if (process.env.MEDIA_DIR) return process.env.MEDIA_DIR;
  const data = process.env.DATA_DIR || (isAzure ? "/home/data/onedealtheday" : path.join(__dirname, "..", "data"));
  return path.join(data, "media");
}

const PUBLIC_PREFIX = "/media/uploads";

const LIMITS = {
  image: 15 * 1024 * 1024,
  video: 500 * 1024 * 1024,
};

/* What the first bytes of each accepted format look like. The browser's
   Content-Type is a claim; these are the file. */
function sniff(head) {
  const bytes = head;
  const ascii = (start, end) => bytes.subarray(start, end).toString("latin1");
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: "image", ext: "jpg" };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "image", ext: "png" };
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { kind: "image", ext: "webp" };
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(ascii(0, 6))) return { kind: "image", ext: "gif" };
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    return { kind: "video", ext: brand.startsWith("qt") ? "mov" : "mp4" };
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { kind: "video", ext: "webm" };
  return null;
}

/**
 * Streams a request body to disk as a drop image or video.
 *
 * @param {import("http").IncomingMessage} req
 * @param {{kind: "image" | "video", directory?: string}} options
 * @returns {Promise<{url: string, bytes: number}>}
 */
function saveUpload(req, { kind, directory = mediaDirectory() }) {
  return new Promise((resolve, reject) => {
    if (!LIMITS[kind]) return reject(Object.assign(new Error("Choose a photo or a video."), { status: 400 }));
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > LIMITS[kind]) {
      return reject(Object.assign(new Error(`That file is too big. The limit is ${Math.round(LIMITS[kind] / 1024 / 1024)} MB.`), { status: 413 }));
    }
    fs.mkdirSync(directory, { recursive: true });
    const id = crypto.randomBytes(12).toString("hex");
    const temporary = path.join(directory, `.${id}.part`);
    const out = fs.createWriteStream(temporary, { flags: "wx" });
    let bytes = 0;
    let head = Buffer.alloc(0);
    let failed = false;

    const fail = (error) => {
      if (failed) return;
      failed = true;
      req.unpipe?.(out);
      out.destroy();
      fs.rm(temporary, { force: true }, () => reject(error));
    };

    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (head.length < 16) head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)]);
      if (bytes > LIMITS[kind]) {
        fail(Object.assign(new Error(`That file is too big. The limit is ${Math.round(LIMITS[kind] / 1024 / 1024)} MB.`), { status: 413 }));
        req.resume();
      }
    });
    req.on("aborted", () => fail(Object.assign(new Error("The upload was interrupted."), { status: 400 })));
    req.on("error", fail);
    out.on("error", fail);
    out.on("finish", () => {
      if (failed) return;
      const format = sniff(head);
      if (!bytes) return fail(Object.assign(new Error("That file is empty."), { status: 400 }));
      if (!format || format.kind !== kind) {
        return fail(Object.assign(
          new Error(kind === "image" ? "That is not a JPG, PNG, WebP or GIF image." : "That is not an MP4, MOV or WebM video."),
          { status: 415 },
        ));
      }
      const name = `${id}.${format.ext}`;
      fs.rename(temporary, path.join(directory, name), (error) => {
        if (error) return fail(error);
        resolve({ url: `${PUBLIC_PREFIX}/${name}`, bytes });
      });
    });
    req.pipe(out);
  });
}

/* A path the uploads route produced, and nothing that could climb out of it. */
function isUploadedMedia(value) {
  return /^\/media\/uploads\/[a-f0-9]{24}\.(?:jpg|png|webp|gif|mp4|mov|webm)$/.test(String(value || ""));
}

function isVideoFile(value) {
  return /\.(?:mp4|mov|webm)(?:[?#].*)?$/i.test(String(value || ""));
}

module.exports = { LIMITS, PUBLIC_PREFIX, isUploadedMedia, isVideoFile, mediaDirectory, saveUpload, sniff };

// @bun
// src/index.ts
import { homedir } from "os";
import path2 from "path";

// src/files.ts
import { randomBytes } from "crypto";
import { mkdir, readFile, realpath, writeFile } from "fs/promises";
import path from "path";
var IMAGE_BYTES = 25000000;
var WORK_FOLDER = "generated-images";
var extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
function imageFiles(options) {
  async function defaultFolder() {
    if (!options.pictures)
      throw new Error("image-viewer-client-required");
    return path.join(options.pictures, "Linden AI");
  }
  async function custom() {
    const value = await Bun.file(options.settingsFile).json().catch(() => ({}));
    return typeof value.folder === "string" && path.isAbsolute(value.folder) ? value.folder : undefined;
  }
  async function folder() {
    return await custom() ?? defaultFolder();
  }
  return {
    async settings() {
      const chosen = await custom();
      return { folder: chosen ?? await defaultFolder(), default: await defaultFolder(), custom: !!chosen };
    },
    async setFolder(value) {
      if (value !== null && !path.isAbsolute(value))
        throw new Error("image-folder");
      await mkdir(path.dirname(options.settingsFile), { recursive: true });
      await writeFile(options.settingsFile, JSON.stringify(value ? { folder: path.normalize(value) } : {}) + `
`, { mode: 384 });
      return this.settings();
    },
    async save(input) {
      if (input.scope === "work" && (!input.directory || !path.isAbsolute(input.directory)))
        throw new Error("image-directory");
      const bytes = Buffer.from(input.data, "base64");
      if (!bytes.byteLength || bytes.byteLength > IMAGE_BYTES || detect(bytes) !== input.mime)
        throw new Error("image-format");
      const target = input.scope === "work" ? path.join(input.directory, WORK_FOLDER) : await folder();
      await mkdir(target, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
      const slug = (input.name ?? "").normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";
      const file = path.join(target, `${stamp}-${slug}-${randomBytes(2).toString("hex")}.${extensions[input.mime]}`);
      await writeFile(file, bytes, { flag: "wx" });
      return { path: file, name: path.basename(file) };
    },
    async read(file) {
      const real = await realpath(file).catch(() => {
        throw new Error("image-missing");
      });
      const shared = await realpath(await folder()).catch(() => {
        return;
      });
      const managed = shared && (real === shared || real.startsWith(shared + path.sep)) || real.split(path.sep).includes(WORK_FOLDER);
      if (!managed)
        throw new Error("image-forbidden");
      const bytes = await readFile(real);
      const mime = detect(bytes);
      if (bytes.byteLength > IMAGE_BYTES || !mime)
        throw new Error("image-format");
      return { data: bytes.toString("base64"), mime };
    }
  };
}
function detect(bytes) {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71)
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP")
    return "image/webp";
  return;
}

// src/index.ts
var code = (error) => error instanceof Error && /^image-[a-z-]+$/.test(error.message) ? error.message : "image-failed";
var object = { type: "object" };
var errors = { image: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } };
var definition = { id: "linden.images", events: {}, methods: {
  settings: { input: { ...object, properties: { folder: { type: ["string", "null"], maxLength: 4096 } }, additionalProperties: false }, output: object, errors },
  save: { input: { ...object, properties: {
    scope: { enum: ["work", "shared"] },
    directory: { type: "string", maxLength: 4096 },
    name: { type: "string", maxLength: 200 },
    mime: { enum: ["image/png", "image/jpeg", "image/webp"] },
    data: { type: "string", maxLength: 34000000 }
  }, required: ["scope", "mime", "data"], additionalProperties: false }, output: object, errors },
  read: { input: { ...object, properties: { path: { type: "string", minLength: 1, maxLength: 4096 } }, required: ["path"], additionalProperties: false }, output: object, errors }
} };
var src_default = { id: "linden.image-viewer", async setup(ctx) {
  const store = imageFiles({
    pictures: process.env.LINDEN_PICTURES_DIRECTORY,
    settingsFile: path2.join(process.env.XDG_DATA_HOME ?? path2.join(homedir(), ".local/share"), "opencode", "linden-plugin-resources", "image-viewer.json")
  });
  const registration = await ctx.rpc.register(definition, {
    async settings(input, context) {
      const value = input;
      try {
        return value.folder === undefined ? await store.settings() : await store.setFolder(value.folder);
      } catch (error) {
        return context.error("image", "Image settings failed", { code: code(error) });
      }
    },
    async save(input, context) {
      try {
        return await store.save(input);
      } catch (error) {
        return context.error("image", "Image could not be saved", { code: code(error) });
      }
    },
    async read(input, context) {
      try {
        return await store.read(input.path);
      } catch (error) {
        return context.error("image", "Image could not be read", { code: code(error) });
      }
    }
  });
  return async () => {
    await registration.dispose();
  };
} };
export {
  src_default as default
};

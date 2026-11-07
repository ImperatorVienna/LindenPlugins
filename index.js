// @bun
// src/index.ts
import { realpath } from "fs/promises";
import path from "path";

// src/rpc.ts
var id = { type: "string", minLength: 1 };
var inspection = { type: "object", properties: { pages: { type: "boolean" } }, required: ["pages"], additionalProperties: false };
var result = { type: "object", properties: { text: { type: "string" }, warnings: { type: "array", items: { type: "string" } }, pages: { type: "number" }, inspected: { type: "boolean" } }, required: ["text", "warnings"] };
var errors = { document: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } };
var task = { type: "object", properties: { id }, required: ["id"], additionalProperties: false };
var Documents = {
  id: "linden.documents",
  methods: {
    info: { input: { type: "object", additionalProperties: false }, output: { type: "object", properties: { version: { type: "string" } }, required: ["version"] } },
    open: { input: { type: "object", properties: { id, name: id, inspection }, required: ["id", "name"], additionalProperties: false }, output: { type: "boolean" }, errors },
    append: { input: { type: "object", properties: { id, base64: { type: "string", maxLength: 1333336 } }, required: ["id", "base64"], additionalProperties: false }, output: { type: "boolean" }, errors },
    run: { input: task, output: result, errors },
    parse: {
      input: { type: "object", properties: { id, name: id, base64: { type: "string" }, inspection }, required: ["id", "name", "base64"], additionalProperties: false },
      output: result,
      errors: { document: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } }
    },
    cancel: { input: task, output: { type: "boolean" } },
    status: {
      input: task,
      output: { type: "object", properties: { active: { type: "boolean" }, page: { type: "number" }, total: { type: "number" } }, required: ["active", "page", "total"] }
    }
  },
  events: {}
};

// ../linden-documents/src/limits.ts
var FILE_LIMIT = 50000000;

// src/tasks.ts
class Tasks {
  active = new Map;
  uploads = new Map;
  open(input) {
    if (this.active.has(input.id) || this.uploads.has(input.id))
      throw new Error("duplicate-task");
    if (this.uploads.size + this.active.size >= 4)
      throw new Error("busy");
    this.uploads.set(input.id, { ...input, chunks: [], size: 0, timer: setTimeout(() => this.cancel(input.id), 180000) });
    return true;
  }
  append(input) {
    const upload = this.uploads.get(input.id);
    if (!upload)
      throw new Error("cancelled");
    const bytes = Buffer.from(input.base64, "base64");
    if (bytes.length > 1e6 || bytes.toString("base64") !== input.base64)
      throw new Error("encoding");
    if (upload.size + bytes.length >= FILE_LIMIT) {
      this.cancel(input.id);
      throw new Error("size");
    }
    upload.size += bytes.length;
    upload.chunks.push(bytes);
    return true;
  }
  run(id, signal) {
    const upload = this.uploads.get(id);
    if (!upload)
      throw new Error("cancelled");
    clearTimeout(upload.timer);
    this.uploads.delete(id);
    return this.parse({ id, name: upload.name, base64: Buffer.concat(upload.chunks).toString("base64"), inspection: upload.inspection }, signal);
  }
  status(id) {
    const task = this.active.get(id);
    return { active: !!task, page: task?.page ?? 0, total: task?.total ?? 0 };
  }
  cancel(id) {
    const task = this.active.get(id);
    const upload = this.uploads.get(id);
    if (upload)
      clearTimeout(upload.timer);
    this.uploads.delete(id);
    task?.controller.abort();
    return !!task || !!upload;
  }
  close() {
    for (const id of this.uploads.keys())
      this.cancel(id);
    for (const task of this.active.values())
      task.controller.abort();
  }
  async parse(input, signal) {
    if (signal.aborted)
      throw new Error("cancelled");
    if (this.active.has(input.id))
      throw new Error("duplicate-task");
    if (this.active.size >= 4)
      throw new Error("busy");
    if (input.base64.length > Math.ceil(FILE_LIMIT / 3) * 4)
      throw new Error("size");
    const decoded = Buffer.from(input.base64, "base64");
    if (decoded.toString("base64") !== input.base64)
      throw new Error("encoding");
    const data = new Uint8Array(decoded);
    if (data.length >= FILE_LIMIT)
      throw new Error("size");
    const task = { controller: new AbortController, page: 0, total: 0 };
    const worker = new Worker(new URL(import.meta.url.endsWith(".ts") ? "./worker.ts" : "./worker.js", import.meta.url).href);
    this.active.set(input.id, task);
    const abort = () => task.controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    try {
      return await new Promise((resolve, reject) => {
        task.controller.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
        worker.onerror = (event) => {
          event.preventDefault();
          reject(new Error("worker"));
        };
        worker.onmessage = (event) => {
          if (event.data.progress)
            Object.assign(task, event.data.progress);
          if (event.data.error)
            reject(new Error(event.data.error));
          if (event.data.result)
            resolve(event.data.result);
        };
        worker.postMessage({ name: input.name, data, inspection: input.inspection }, [data.buffer]);
      });
    } finally {
      worker.terminate();
      signal.removeEventListener("abort", abort);
      this.active.delete(input.id);
    }
  }
}

// src/index.ts
var src_default = {
  id: "linden.document-parser",
  async setup(ctx) {
    const tasks = new Tasks;
    const manifest = await Bun.file(new URL("./package.json", import.meta.url)).json().catch(() => ({ version: "development" }));
    const registration = await ctx.rpc.register(Documents, {
      async info() {
        return { version: manifest.version };
      },
      async open(input, context) {
        try {
          return tasks.open(input);
        } catch (error) {
          return context.error("document", "Document upload failed", { code: error instanceof Error ? error.message : "format" });
        }
      },
      async append(input, context) {
        try {
          return tasks.append(input);
        } catch (error) {
          return context.error("document", "Document upload failed", { code: error instanceof Error ? error.message : "format" });
        }
      },
      async run(input, context) {
        try {
          return await tasks.run(input.id, context.signal);
        } catch (error) {
          return context.error("document", "Document parsing failed", { code: error instanceof Error ? error.message : "format" });
        }
      },
      async parse(input, context) {
        try {
          return await tasks.parse(input, context.signal);
        } catch (error) {
          return context.error("document", "Document parsing failed", {
            code: error instanceof Error ? error.message : "format"
          });
        }
      },
      async cancel(input) {
        return tasks.cancel(input.id);
      },
      async status(input) {
        return tasks.status(input.id);
      }
    });
    const tool = await ctx.tool.transform((editor) => editor.add({
      name: "linden_document_read",
      options: { codemode: false, permission: "read" },
      description: "Read a local PDF, Word, Excel, PowerPoint or text document. Excel includes formulas and cached values; it does not recalculate them. Requires file read permission.",
      input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      async execute(input, context) {
        const requested = path.resolve(ctx.location.directory, input.path);
        const authorize = async (target) => {
          const relative = path.relative(ctx.location.directory, target);
          if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
            await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent, action: "external_directory", resources: [path.dirname(target)] });
          await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent, action: "read", resources: [target] });
        };
        await authorize(requested);
        const file = await realpath(requested);
        if (file !== requested)
          await authorize(file);
        const data = Bun.file(file);
        if (data.size >= 50000000)
          throw new Error("Document exceeds 50 MB. Split it before reading.");
        const result = await tasks.parse({ id: crypto.randomUUID(), name: path.basename(file), base64: Buffer.from(await data.arrayBuffer()).toString("base64") }, context.signal);
        return { content: result.text, metadata: { warnings: result.warnings } };
      }
    }));
    return async () => {
      tasks.close();
      await registration.dispose();
      await tool.dispose();
    };
  }
};
export {
  src_default as default
};

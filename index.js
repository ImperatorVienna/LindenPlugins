// @bun
// src/index.ts
import { homedir } from "os";
import path from "path";

// src/local.ts
import { createHash } from "crypto";
import { mkdir, readdir, rename, rm } from "fs/promises";
import { join } from "path";
var LOCAL_MODELS = [
  { id: "qwen3-1.7b", name: "Qwen3 1.7B Q8_0", repository: "Qwen/Qwen3-1.7B-GGUF", revision: "90862c4b9d2787eaed51d12237eafdfe7c5f6077", file: "Qwen3-1.7B-Q8_0.gguf", size: 1834426016, sha256: "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a" },
  { id: "qwen3-4b", name: "Qwen3 4B Q4_K_M", repository: "Qwen/Qwen3-4B-GGUF", revision: "bc640142c66e1fdd12af0bd68f40445458f3869b", file: "Qwen3-4B-Q4_K_M.gguf", size: 2497280256, sha256: "7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5" }
];
var isLocalModel = (value) => LOCAL_MODELS.some((model) => model.id === value);
var LOCAL_CONTEXT = 16384;
var LOCAL_OUTPUT = 4096;
async function localEngine(options) {
  await mkdir(options.storage, { recursive: true });
  for (const name of await readdir(options.storage))
    if (name.endsWith(".partial"))
      await rm(join(options.storage, name), { force: true });
  const engineAvailable = await Bun.file(options.binary).exists();
  const file = (model) => join(options.storage, LOCAL_MODELS.find((item) => item.id === model).file);
  const installed = new Set((await Promise.all(LOCAL_MODELS.map(async (model) => {
    const found = Bun.file(file(model.id));
    return await found.exists() && found.size === model.size ? model.id : undefined;
  }))).filter(isLocalModel));
  let download;
  let error;
  let queue = Promise.resolve();
  const status = () => ({
    engineAvailable,
    models: LOCAL_MODELS.map((model) => ({ id: model.id, name: model.name, size: model.size, installed: installed.has(model.id) })),
    ...download ? { download: { model: download.model, received: download.received, total: download.total } } : {},
    ...error ? { error } : {}
  });
  const fetchModel = async (model, controller) => {
    const temporary = `${file(model.id)}.partial`;
    try {
      const response = await fetch(`https://huggingface.co/${model.repository}/resolve/${model.revision}/${model.file}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2 * 60 * 60000)]) });
      if (!response.ok || !response.body)
        throw new Error("compaction-local-download");
      const hash = createHash("sha256");
      const writer = Bun.file(temporary).writer();
      try {
        for await (const chunk of response.body) {
          download.received += chunk.length;
          if (download.received > model.size)
            throw new Error("compaction-local-integrity");
          hash.update(chunk);
          writer.write(chunk);
          await writer.flush();
        }
      } finally {
        await writer.end();
      }
      if (download.received !== model.size || hash.digest("hex") !== model.sha256)
        throw new Error("compaction-local-integrity");
      await rename(temporary, file(model.id));
      installed.add(model.id);
      await options.installed(model.id);
    } finally {
      await rm(temporary, { force: true });
    }
  };
  return {
    status,
    install(model) {
      if (download)
        throw new Error("compaction-local-busy");
      if (!engineAvailable)
        throw new Error("compaction-local-engine");
      if (installed.has(model))
        return options.installed(model).then(status);
      const resource = LOCAL_MODELS.find((item) => item.id === model);
      const controller = new AbortController;
      error = undefined;
      const task = fetchModel(resource, controller).catch((cause) => {
        if (!controller.signal.aborted)
          error = cause instanceof Error && cause.message === "compaction-local-integrity" ? cause.message : "compaction-local-download";
      }).finally(() => {
        download = undefined;
      });
      download = { model, received: 0, total: resource.size, controller, task };
      return Promise.resolve(status());
    },
    async cancel() {
      download?.controller.abort();
      await download?.task;
      return status();
    },
    async remove(model) {
      if (download?.model === model)
        throw new Error("compaction-local-busy");
      await rm(file(model), { force: true });
      installed.delete(model);
      return status();
    },
    run(model, work) {
      if (!engineAvailable)
        return Promise.reject(new Error("compaction-local-engine"));
      if (!installed.has(model))
        return Promise.reject(new Error("compaction-local-not-installed"));
      const result = queue.then(() => serve(options.binary, file(model), work));
      queue = result.then(() => {
        return;
      }, () => {
        return;
      });
      return result;
    },
    async close() {
      download?.controller.abort();
      await download?.task;
    }
  };
}
async function serve(binary, model, work) {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response });
  const port = probe.port;
  await probe.stop();
  const child = Bun.spawn([binary, "-m", model, "--host", "127.0.0.1", "--port", String(port), "-c", String(LOCAL_CONTEXT), "--jinja", "--no-webui"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 180000;
    while (!await fetch(`${base}/health`).then((response) => response.ok, () => false)) {
      if (child.exitCode !== null || Date.now() > deadline)
        throw new Error("compaction-local-engine");
      await Bun.sleep(250);
    }
    return await work(async (prompt) => {
      const response = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: LOCAL_OUTPUT, temperature: 0.3, chat_template_kwargs: { enable_thinking: false } }),
        signal: AbortSignal.timeout(30 * 60000)
      });
      if (!response.ok)
        throw new Error("compaction-local-failed");
      const body = await response.json();
      return (body.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    });
  } finally {
    child.kill();
    await child.exited;
  }
}

// src/rules.ts
var PROMPT_TOKENS = 2000;
var summaryTokens = (model) => Math.min(model.output, 8192);
var capacity = (model) => Math.max(1000, model.context - summaryTokens(model) - PROMPT_TOKENS);
var estimateTokens = (text) => Math.ceil(new TextEncoder().encode(text).length / 3);
function planCompaction(input) {
  if (input.local)
    return { model: input.local, chunked: input.needed > capacity(input.local), local: true };
  const fallback = input.pinned === null ? "unavailable" : input.pinned && input.needed > capacity(input.pinned) ? "too-small" : undefined;
  if (input.pinned && !fallback)
    return { model: input.pinned, chunked: false };
  if (input.needed <= capacity(input.conversation))
    return { model: input.conversation, chunked: false, fallback };
  return { model: input.pinned ?? input.conversation, chunked: true, fallback };
}
function chunks(text, budget) {
  const pieces = text.split(`
`).flatMap((line) => {
    if (estimateTokens(line) <= budget)
      return [line];
    const size = Math.max(1, budget);
    return Array.from({ length: Math.ceil(line.length / size) }, (_, index) => line.slice(index * size, (index + 1) * size));
  });
  return pieces.reduce((result, line) => {
    const last = result.at(-1);
    if (last !== undefined && estimateTokens(last + `
` + line) <= budget)
      result[result.length - 1] = last + `
` + line;
    else
      result.push(line);
    return result;
  }, []);
}
var SECTIONS = `## Goal
## Decisions and constraints
## Files and changes
## Done so far
## Open tasks and next steps
## Important details`;
function summaryPrompt(transcript, previous, part) {
  return [
    "You are compacting a conversation so it can continue within a limited context. Write a faithful summary that lets the assistant carry on without the original messages.",
    "Keep every decision, constraint, file path, identifier, number, error and unfinished task; drop pleasantries and repetition. Write in the language the conversation uses. Do not invent anything.",
    `Use exactly these sections, leaving a section empty only when nothing applies:
${SECTIONS}`,
    ...previous ? [`Summary of the earlier part of the conversation (update and extend it; keep what still matters):
${previous}`] : [],
    `${part && part.total > 1 ? `Conversation, part ${part.index + 1} of ${part.total}` : "Conversation"}:
${transcript}`
  ].join(`

`);
}
function transcript(messages) {
  const text = (value) => typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return messages.map((message) => {
    const parts = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;
    const body = parts.map((part) => part.type === "text" || part.type === "reasoning" ? part.text ?? "" : part.type === "tool-call" ? `[tool call ${part.name ?? ""}] ${text(part.input)}` : part.type === "tool-result" ? `[tool result ${part.name ?? ""}] ${text(part.result ?? part.value)}` : `[${part.type}]`).filter(Boolean).join(`
`);
    return `${message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : message.role}: ${body}`;
  }).join(`

`);
}

// src/index.ts
var object = { type: "object" };
var errors = { compaction: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } };
var localModel = { enum: LOCAL_MODELS.map((model) => model.id) };
var definition = {
  id: "linden.compaction",
  events: {
    question: { schema: { type: "object", properties: {
      sessionID: { type: "string" },
      id: { type: "string" },
      title: { type: "string" },
      fields: { type: "array", items: { type: "object" } },
      metadata: { type: "object" }
    }, required: ["sessionID", "id", "title", "fields"] } }
  },
  methods: {
    settings: { input: { ...object, properties: { model: { type: "string", minLength: 1, maxLength: 256 }, local: { enum: ["off", ...LOCAL_MODELS.map((model) => model.id)] } }, additionalProperties: false }, output: object, errors },
    local: { input: { ...object, properties: { action: { enum: ["install", "cancel", "remove"] }, model: localModel }, required: ["action"], additionalProperties: false }, output: object, errors }
  }
};
var shared;
var users = 0;
var code = (error) => error instanceof Error && /^compaction-[a-z-]+$/.test(error.message) ? error.message : "compaction-failed";
var src_default = { id: "linden.context-compaction-enhancement", async setup(ctx) {
  const model = async () => {
    const value = await ctx.storage.get("model");
    return typeof value === "string" ? value : "conversation";
  };
  const local = async () => {
    const value = await ctx.storage.get("local");
    return isLocalModel(value) ? value : "off";
  };
  users++;
  const storage = path.join(process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local/share"), "opencode", "linden-plugin-resources", "context-compaction");
  const binary = path.join(import.meta.dir, "native", `${process.platform}-${process.arch}`, process.platform === "win32" ? "llama-server.exe" : "llama-server");
  shared ??= localEngine({ storage, binary, installed: async (installed) => {
    await ctx.storage.set("local", installed);
  } });
  const engine = await shared.catch((error) => {
    users--;
    shared = undefined;
    throw error;
  });
  const overrides = new Map;
  const asked = new Map;
  const settings = async () => ({ model: await model(), local: { selected: await local(), ...engine.status() } });
  const registration = await ctx.rpc.register(definition, {
    async settings(input, context) {
      const value = input;
      if (value.local && value.local !== "off" && !engine.status().models.find((item) => item.id === value.local)?.installed)
        return context.error("compaction", "Local model not installed", { code: "compaction-local-not-installed" });
      if (value.model !== undefined)
        await ctx.storage.set("model", value.model);
      if (value.local !== undefined)
        await ctx.storage.set("local", value.local);
      return settings();
    },
    async local(input, context) {
      const value = input;
      try {
        if (value.action === "cancel")
          await engine.cancel();
        if (value.action !== "cancel" && !value.model)
          throw new Error("compaction-local-model");
        if (value.action === "install")
          await engine.install(value.model);
        if (value.action === "remove") {
          await engine.remove(value.model);
          if (await local() === value.model)
            await ctx.storage.set("local", "off");
        }
        return settings();
      } catch (error) {
        return context.error("compaction", "Local model operation failed", { code: code(error) });
      }
    }
  });
  const generate = async (prompt, target) => {
    const reply = await ctx.generate.text({ prompt, model: { providerID: target.providerID, id: target.id } });
    return reply.text;
  };
  const rolling = async (text, plan, write) => {
    const filled = async (prompt) => {
      const summary = (await write(prompt)).trim();
      if (!summary)
        throw new Error("compaction-empty-summary");
      return summary;
    };
    if (!plan.chunked)
      return filled(summaryPrompt(text));
    const parts = chunks(text, Math.floor(capacity(plan.model) / 2));
    return parts.reduce(async (previous, part, index) => filled(summaryPrompt(part, await previous, { index, total: parts.length })), Promise.resolve(undefined));
  };
  const summarize = (text, plan) => plan.local ? engine.run(plan.model.id, (write) => rolling(text, plan, write)) : rolling(text, plan, (prompt) => generate(prompt, plan.model));
  const hook = await ctx.session.hook("compaction", async (input) => {
    if (input.result)
      return;
    const retry = overrides.get(input.sessionID);
    overrides.delete(input.sessionID);
    const offered = (await ctx.model.list()).data;
    const describe = (providerID, id) => {
      const found = offered.find((item) => item.providerID === providerID && (item.modelID === id || item.id === id));
      return found && { providerID: found.providerID, id: found.modelID, name: found.name, context: found.limit.context, output: found.limit.output };
    };
    const chosenLocal = retry === "cloud" ? "off" : await local();
    const localModel = chosenLocal === "off" ? undefined : LOCAL_MODELS.find((item) => item.id === chosenLocal);
    const conversation = describe(input.model.providerID, input.model.id);
    if (!conversation && !localModel)
      return;
    const chosen = await model();
    const pinned = !conversation || chosen === "conversation" || retry === "conversation" ? undefined : describe(conversation.providerID, chosen) ?? null;
    const text = transcript(input.messages);
    const planned = planCompaction({
      needed: estimateTokens(text),
      pinned,
      conversation,
      local: localModel && { providerID: "local", id: localModel.id, name: localModel.name, context: LOCAL_CONTEXT, output: LOCAL_OUTPUT }
    });
    const plan = retry === "chunked" ? { ...planned, chunked: true } : planned;
    try {
      input.result = { summary: await summarize(text, plan), metadata: { linden: { model: plan.model.id, chunked: plan.chunked, ...plan.fallback ? { fallback: plan.fallback } : {}, ...plan.local ? { local: true } : {} } } };
    } catch (error) {
      const id = `frm_compaction_${crypto.randomUUID()}`;
      asked.set(id, input.sessionID);
      await registration.events.emit("question", {
        sessionID: input.sessionID,
        id,
        title: "compaction-failed",
        metadata: { module: definition.id, model: plan.model.name, reason: error instanceof Error ? error.message : String(error), ...plan.local ? { local: true } : {} },
        fields: [{ key: "action", type: "string", required: true, title: `compaction-failed:${plan.model.name}`, options: plan.local ? [
          { value: "local", label: "Retry locally" },
          { value: "cloud", label: "Use the cloud model this time" },
          { value: "dismiss", label: "Not now" }
        ] : [
          { value: "conversation", label: "Retry with the conversation model" },
          { value: "chunked", label: "Retry in rolling chunks" },
          { value: "dismiss", label: "Not now" }
        ] }]
      });
      throw error;
    }
  });
  const stop = new AbortController;
  (async () => {
    for await (const event of ctx.event.subscribe()) {
      if (stop.signal.aborted)
        return;
      if (event.type !== "form.replied")
        continue;
      const session = asked.get(event.data.id);
      if (!session)
        continue;
      asked.delete(event.data.id);
      const action = event.data.answer.action;
      if (action !== "conversation" && action !== "chunked" && action !== "local" && action !== "cloud")
        continue;
      overrides.set(session, action);
      await ctx.session.compact({ sessionID: session }).catch(() => overrides.delete(session));
    }
  })().catch(() => {});
  return async () => {
    stop.abort();
    await hook.dispose();
    await registration.dispose();
    if (--users === 0) {
      await engine.close();
      shared = undefined;
    }
  };
} };
export {
  src_default as default,
  definition
};

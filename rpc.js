// @bun
// src/rpc.ts
var id = { type: "string", minLength: 1 };
var inspection = { type: "object", properties: { pages: { type: "boolean" } }, required: ["pages"], additionalProperties: false };
var result = { type: "object", properties: { text: { type: "string" }, warnings: { type: "array", items: { type: "string" } }, pages: { type: "number" }, inspected: { type: "boolean" } }, required: ["text", "warnings"] };
var errors = { document: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } };
var task = { type: "object", properties: { id }, required: ["id"], additionalProperties: false };
var Documents = {
  id: "linden.documents",
  methods: {
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
export {
  Documents
};

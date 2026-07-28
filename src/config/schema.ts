import { z } from "zod";

export const ConfigSchema = z.object({
  provider: z.string().default("nvidia"),
  defaultModel: z
    .string()
    .default("nvidia/nemotron-3-super-120b-a12b"),
  mode: z.enum(["chat", "agent"]).default("chat"),
  stream: z.boolean().default(true),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().positive().default(4096),
  topP: z.number().min(0).max(1).default(1.0),
  permissions: z
    .object({
      readFiles: z.boolean().default(true),
      writeFiles: z.enum(["ask", "allow", "deny"]).default("ask"),
      runCommands: z.enum(["ask", "allow", "deny"]).default("ask"),
      network: z.enum(["ask", "allow", "deny"]).default("ask"),
    })
    .default({
      readFiles: true,
      writeFiles: "ask",
      runCommands: "ask",
      network: "ask",
    }),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

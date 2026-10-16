import { z } from "zod";

export const FlowNodeType = z.enum([
  "start",
  "announce",
  "tts",
  "menu",
  "api",
  "condition",
  "time_condition",
  "set_var",
  "language",
  "directory",
  "transfer",
  "queue",
  "voicemail",
  "subflow",
  "hangup",
]);

export type FlowNodeType = z.infer<typeof FlowNodeType>;

export const FlowNodeSchema = z.object({
  id: z.string(),
  type: FlowNodeType,
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()).default({}),
});

export const FlowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional().nullable(),
  label: z.string().optional(),
});

export const FlowJsonSchema = z.object({
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
  variables: z.array(z.string()).default([]),
});

export type FlowJson = z.infer<typeof FlowJsonSchema>;

export const FlowCreateSchema = z.object({
  name: z.string().min(1).max(100),
  extensionNumber: z
    .string()
    .regex(/^\d{2,8}$/)
    .optional()
    .nullable(),
});

export const FlowUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  extensionNumber: z
    .string()
    .regex(/^\d{2,8}$/)
    .nullable()
    .optional(),
});

export const emptyFlow = (): FlowJson => ({
  nodes: [
    {
      id: "start",
      type: "start",
      position: { x: 80, y: 120 },
      data: {},
    },
  ],
  edges: [],
  variables: ["caller", "did", "time"],
});

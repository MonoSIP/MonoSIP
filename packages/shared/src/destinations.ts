import { z } from "zod";

export const DestinationType = z.enum([
  "extension",
  "ring_group",
  "queue",
  "flow",
  "schedule",
  "voicemail",
  "external",
  "announce_hangup",
  "hangup",
  "park",
]);

export type DestinationType = z.infer<typeof DestinationType>;

export const DestinationSchema = z.object({
  destType: DestinationType,
  destId: z.string().nullable(),
});

export type Destination = z.infer<typeof DestinationSchema>;

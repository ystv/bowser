import { z } from "zod";

export const createStreamsPayloadSchema = z.object({
  show_id: z.coerce.number(),
  enableEmbed: z.boolean(),
  items: z.array(
    z.object({
      enabled: z.boolean(),
      title: z.string().nonempty(),
      description: z.string(),
      start: z.date(),
      end: z.date(),
      visibility: z.enum(["public", "unlisted", "private"]),
      // thumbnail: z.string(),
      rundownID: z.number().optional(),
      continuityItemID: z.number().optional(),
      isShowBroadcast: z.boolean().optional(),
    }),
  ),
  ingestionType: z.enum(["rtmp", "dash"]),
  resolution: z.enum([
    "240p",
    "360p",
    "480p",
    "720p",
    "1080p",
    "1440p",
    "2160p",
  ]),
  frameRate: z.enum(["30fps", "60fps"]),
});

import {
    ShowSchema,
    ContinuityItemSchema,
    RundownSchema,
    MediaSchema,
    RundownItemSchema,
    MediaProcessingTaskSchema
} from "./modelSchema";
import { z } from "zod";

/*
 * These types are used in desktop and the tRPC API. They're defined here to ensure that the types stay in sync,
 * and that we can use the zod-prisma autogenerated ones as a base. (NB: we have `relationModel` set to false in the
 * zod-prisma config because it'd create circular types, so we have to define relations manually.)
 */

export const PartialShowModel = ShowSchema.extend({
  continuityItems: z.array(ContinuityItemSchema),
  rundowns: z.array(RundownSchema),
});
const PartialMediaModel = MediaSchema.extend({});
export const CompleteContinuityItemModel = ContinuityItemSchema.extend({
  media: PartialMediaModel.nullable(),
});
export const CompleteShowModel = ShowSchema.extend({
  continuityItems: z.array(CompleteContinuityItemModel),
  rundowns: z.array(
    RundownSchema.extend({
      items: z.array(
        RundownItemSchema.extend({
          media: z.array(PartialMediaModel),
        }),
      ),
    }),
  ),
});

export const CompleteMediaModel = PartialMediaModel.extend({
  tasks: z.array(MediaProcessingTaskSchema),
});

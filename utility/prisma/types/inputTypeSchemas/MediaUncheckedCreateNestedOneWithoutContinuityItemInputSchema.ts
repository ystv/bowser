import type { Prisma } from "../../client";
import { z } from "zod";
import { MediaCreateWithoutContinuityItemInputSchema } from "./MediaCreateWithoutContinuityItemInputSchema";
import { MediaUncheckedCreateWithoutContinuityItemInputSchema } from "./MediaUncheckedCreateWithoutContinuityItemInputSchema";
import { MediaCreateOrConnectWithoutContinuityItemInputSchema } from "./MediaCreateOrConnectWithoutContinuityItemInputSchema";
import { MediaWhereUniqueInputSchema } from "./MediaWhereUniqueInputSchema";

export const MediaUncheckedCreateNestedOneWithoutContinuityItemInputSchema: z.ZodType<Prisma.MediaUncheckedCreateNestedOneWithoutContinuityItemInput> =
  z
    .object({
      create: z
        .union([
          z.lazy(() => MediaCreateWithoutContinuityItemInputSchema),
          z.lazy(() => MediaUncheckedCreateWithoutContinuityItemInputSchema),
        ])
        .optional(),
      connectOrCreate: z
        .lazy(() => MediaCreateOrConnectWithoutContinuityItemInputSchema)
        .optional(),
      connect: z.lazy(() => MediaWhereUniqueInputSchema).optional(),
    })
    .strict();

export default MediaUncheckedCreateNestedOneWithoutContinuityItemInputSchema;
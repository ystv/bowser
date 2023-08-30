import type { Prisma } from "../../client";
import { z } from "zod";
import { StringFieldUpdateOperationsInputSchema } from "./StringFieldUpdateOperationsInputSchema";
import { IntFieldUpdateOperationsInputSchema } from "./IntFieldUpdateOperationsInputSchema";
import { ShowUpdateOneRequiredWithoutRundownsNestedInputSchema } from "./ShowUpdateOneRequiredWithoutRundownsNestedInputSchema";
import { RundownItemUpdateManyWithoutRundownNestedInputSchema } from "./RundownItemUpdateManyWithoutRundownNestedInputSchema";

export const RundownUpdateWithoutAssetsInputSchema: z.ZodType<Prisma.RundownUpdateWithoutAssetsInput> =
  z
    .object({
      name: z
        .union([
          z.string(),
          z.lazy(() => StringFieldUpdateOperationsInputSchema),
        ])
        .optional(),
      order: z
        .union([
          z.number().int(),
          z.lazy(() => IntFieldUpdateOperationsInputSchema),
        ])
        .optional(),
      show: z
        .lazy(() => ShowUpdateOneRequiredWithoutRundownsNestedInputSchema)
        .optional(),
      items: z
        .lazy(() => RundownItemUpdateManyWithoutRundownNestedInputSchema)
        .optional(),
    })
    .strict();

export default RundownUpdateWithoutAssetsInputSchema;
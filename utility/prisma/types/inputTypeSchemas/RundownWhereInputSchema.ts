import type { Prisma } from "../../client";
import { z } from "zod";
import { IntFilterSchema } from "./IntFilterSchema";
import { StringFilterSchema } from "./StringFilterSchema";
import { ShowRelationFilterSchema } from "./ShowRelationFilterSchema";
import { ShowWhereInputSchema } from "./ShowWhereInputSchema";
import { RundownItemListRelationFilterSchema } from "./RundownItemListRelationFilterSchema";
import { AssetListRelationFilterSchema } from "./AssetListRelationFilterSchema";

export const RundownWhereInputSchema: z.ZodType<Prisma.RundownWhereInput> = z
  .object({
    AND: z
      .union([
        z.lazy(() => RundownWhereInputSchema),
        z.lazy(() => RundownWhereInputSchema).array(),
      ])
      .optional(),
    OR: z
      .lazy(() => RundownWhereInputSchema)
      .array()
      .optional(),
    NOT: z
      .union([
        z.lazy(() => RundownWhereInputSchema),
        z.lazy(() => RundownWhereInputSchema).array(),
      ])
      .optional(),
    id: z.union([z.lazy(() => IntFilterSchema), z.number()]).optional(),
    name: z.union([z.lazy(() => StringFilterSchema), z.string()]).optional(),
    showId: z.union([z.lazy(() => IntFilterSchema), z.number()]).optional(),
    order: z.union([z.lazy(() => IntFilterSchema), z.number()]).optional(),
    show: z
      .union([
        z.lazy(() => ShowRelationFilterSchema),
        z.lazy(() => ShowWhereInputSchema),
      ])
      .optional(),
    items: z.lazy(() => RundownItemListRelationFilterSchema).optional(),
    assets: z.lazy(() => AssetListRelationFilterSchema).optional(),
  })
  .strict();

export default RundownWhereInputSchema;
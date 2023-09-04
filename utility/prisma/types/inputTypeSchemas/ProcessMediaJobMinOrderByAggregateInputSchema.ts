import type { Prisma } from "../../client";
import { z } from "zod";
import { SortOrderSchema } from "./SortOrderSchema";

export const ProcessMediaJobMinOrderByAggregateInputSchema: z.ZodType<Prisma.ProcessMediaJobMinOrderByAggregateInput> =
  z
    .object({
      id: z.lazy(() => SortOrderSchema).optional(),
      mediaId: z.lazy(() => SortOrderSchema).optional(),
      sourceType: z.lazy(() => SortOrderSchema).optional(),
      source: z.lazy(() => SortOrderSchema).optional(),
      base_job_id: z.lazy(() => SortOrderSchema).optional(),
    })
    .strict();

export default ProcessMediaJobMinOrderByAggregateInputSchema;
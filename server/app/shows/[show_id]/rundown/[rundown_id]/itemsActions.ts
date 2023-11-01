"use server";

import { FormResponse } from "@/components/Form";
import { z } from "zod";
import { AddItemSchema, EditItemSchema } from "./schema";
import { zodErrorResponse } from "@/components/FormServerHelpers";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { MediaFileSourceType } from "@bowser/prisma/client";
import { escapeRegExp } from "lodash";

import { dispatchJobForJobrunner } from "@/lib/jobs";

export async function addItem(
  raw: z.infer<typeof AddItemSchema>,
): Promise<FormResponse> {
  const data = AddItemSchema.safeParse(raw);
  if (!data.success) {
    return zodErrorResponse(data.error);
  }
  const res = await db.$transaction(async ($db) => {
    const highestOrder = await $db.rundownItem.aggregate({
      _max: { order: true },
      where: { rundownId: data.data.rundownID },
    });
    const newOrder = (highestOrder._max.order ?? -1) + 1;
    const res = await $db.rundownItem.create({
      data: {
        name: data.data.name,
        type: data.data.type,
        durationSeconds: data.data.durationSeconds,
        notes: data.data.notes,
        order: newOrder,
        rundown: {
          connect: { id: data.data.rundownID },
        },
      },
      include: {
        rundown: true,
      },
    });
    await $db.rundown.update({
      where: {
        id: data.data.rundownID,
      },
      data: {
        show: {
          update: {
            version: {
              increment: 1,
            },
          },
        },
      },
    });
    return res;
  });
  revalidatePath(`/shows/${res.rundown.showId}/rundown/${res.rundownId}`);
  return { ok: true };
}

export async function editItem(
  raw: z.infer<typeof EditItemSchema>,
): Promise<FormResponse> {
  const data = EditItemSchema.safeParse(raw);
  if (!data.success) {
    return zodErrorResponse(data.error);
  }
  const res = await db.rundownItem.update({
    where: {
      id: data.data.itemID,
    },
    data: {
      name: data.data.name,
      type: data.data.type,
      durationSeconds: data.data.durationSeconds,
      notes: data.data.notes,
      rundown: {
        update: {
          show: {
            update: {
              version: {
                increment: 1,
              },
            },
          },
        },
      },
    },
    include: {
      rundown: true,
    },
  });
  revalidatePath(`/shows/${res.rundown.showId}/rundown/${res.rundown.id}`);
  return { ok: true };
}

export async function deleteItem(rundownID: number, itemID: number) {
  const res = await db.$transaction(async ($db) => {
    const oldItem = await $db.rundownItem.delete({
      where: {
        id: itemID,
      },
    });
    if (!oldItem) {
      notFound();
    }
    await $db.rundownItem.updateMany({
      where: {
        rundownId: rundownID,
        order: {
          gt: oldItem.order,
        },
      },
      data: {
        order: {
          decrement: 1,
        },
      },
    });
    const res = await $db.rundown.update({
      where: {
        id: rundownID,
      },
      data: {
        show: {
          update: {
            version: {
              increment: 1,
            },
          },
        },
      },
    });
    await ensureContiguousDEV(rundownID, $db);
    return res;
  });
  revalidatePath(`/shows/${res.showId}/rundown/${res.id}`);
}

export async function reorder(
  rundownID: number,
  itemID: number,
  newOrder: number,
) {
  const showID = await db.$transaction(async ($db) => {
    const rundown = await $db.rundown.findFirst({
      where: {
        id: rundownID,
      },
      include: {
        items: true,
      },
    });
    if (!rundown) {
      notFound();
    }
    const oldItem = rundown.items.find((item) => item.id === itemID);
    if (!oldItem) {
      notFound();
    }
    const oldOrder = oldItem.order;
    console.debug(
      `Rundown ${rundownID}: moving ${oldItem.name} from ${oldOrder} to ${newOrder}`,
    );

    // the rundowns_items tables don't have unique constraints.
    // See the comment in schema.prisma for the background on this.

    // If the item is moving down, we need to move all items between the old and new position (including new) up one.
    // If the item is moving up, we need to move all items between the new and old position (including new) down one.
    // Remember that order is ascending, so moving an item "down" actually means incrementing its position.
    if (oldOrder < newOrder) {
      // Moving up, therefore incrementing order of all items in between
      await $db.rundownItem.updateMany({
        where: {
          rundownId: rundownID,
          order: {
            gte: oldOrder,
            lte: newOrder,
          },
        },
        data: {
          order: {
            decrement: 1,
          },
        },
      });
    } else {
      // Moving down, therefore decrementing order of all items in between
      await $db.rundownItem.updateMany({
        where: {
          rundownId: rundownID,
          order: {
            lte: oldOrder,
            gte: newOrder,
          },
        },
        data: {
          order: {
            increment: 1,
          },
        },
      });
    }
    await $db.rundownItem.update({
      where: {
        id: itemID,
      },
      data: {
        order: newOrder,
        rundown: {
          update: {
            show: {
              update: {
                version: {
                  increment: 1,
                },
              },
            },
          },
        },
      },
    });
    await ensureContiguousDEV(rundownID, $db);
    return rundown.showId;
  });
  revalidatePath(`/shows/${showID}/rundown/${rundownID}`);
}

async function ensureContiguousDEV(
  rundownID: number,
  $db: Parameters<Parameters<typeof db.$transaction>[0]>[0],
) {
  if (process.env.NODE_ENV !== "production") {
    // Sanity check: ensure all items have a contiguous order, otherwise this will break next time
    const rundown = await $db.rundown.findUniqueOrThrow({
      where: {
        id: rundownID,
      },
      include: {
        items: {
          orderBy: { order: "asc" },
        },
      },
    });
    const items = rundown.items.map((i) => i.order);

    if (items.length >= 2) {
      for (let i = 1; i < items.length - 1; i++) {
        if (items[i] !== items[i - 1] + 1) {
          throw new Error(
            `Invariant violation: non-contiguous order for items of rundown ${rundownID}; item ${i} has order ${
              items[i]
            } but item ${i - 1} has order ${items[i - 1]}`,
          );
        }
      }
    }
    if (items.length > 0 && items[items.length - 1] !== items.length - 1) {
      throw new Error(
        `Invariant violation: non-contiguous order for items of rundown ${rundownID}; last item has order ${
          items[items.length - 1]
        } but there are ${items.length} items`,
      );
    }
  }
}

export async function processUploadForRundownItem(
  itemID: number,
  fileName: string,
  uploadURL: string,
) {
  const item = await db.rundownItem.findUnique({
    where: {
      id: itemID,
    },
    include: {
      rundown: true,
    },
  });
  if (!item) {
    throw new Error("Invalid item ID");
  }

  // Sanity check to ensure it was really uploaded where we expected
  if (!uploadURL.startsWith(process.env.TUS_ENDPOINT!)) {
    throw new Error("Invalid upload URL");
  }

  const baseJobID = await db.$transaction(async ($db) => {
    await $db.media.deleteMany({
      where: {
        rundownItem: {
          id: itemID,
        },
      },
    });
    const res = await $db.media.create({
      data: {
        name: fileName,
        durationSeconds: 0,
        rawPath: "",
        rundownItem: {
          connect: {
            id: itemID,
          },
        },
        process_jobs: {
          create: {
            sourceType: MediaFileSourceType.Tus,
            source: uploadURL.replace(
              // Strip off the Tus endpoint prefix so the source is just the ID
              new RegExp(`^${escapeRegExp(process.env.TUS_ENDPOINT!)}/?`),
              "",
            ),
            base_job: {
              create: {},
            },
          },
        },
      },
      include: {
        process_jobs: true,
      },
    });
    await $db.rundown.update({
      where: {
        id: item.rundown.id,
      },
      data: {
        show: {
          update: {
            version: {
              increment: 1,
            },
          },
        },
      },
    });
    return res.process_jobs[0].base_job_id;
  });
  await dispatchJobForJobrunner(baseJobID);
  revalidatePath(`/shows/${item.rundown.showId}`);
  return { ok: true };
}

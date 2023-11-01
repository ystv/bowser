"use server";

import {
  AssetTypeSchema,
  AssetTypeType,
} from "@bowser/prisma/types/inputTypeSchemas/AssetTypeSchema";
import { FormResponse } from "@/components/Form";
import { db } from "@/lib/db";
import { escapeRegExp } from "lodash";
import { revalidatePath } from "next/cache";

import { dispatchJobForJobrunner } from "@/lib/jobs";

export async function processAssetUpload(
  rundownID: number,
  type: AssetTypeType,
  fileName: string,
  uploadURL: string,
): Promise<FormResponse> {
  // Sanity check to ensure it was really uploaded where we expected
  if (!uploadURL.startsWith(process.env.TUS_ENDPOINT!)) {
    throw new Error("Invalid upload URL");
  }

  type = AssetTypeSchema.parse(type);

  const rundown = await db.rundown.findUniqueOrThrow({
    where: {
      id: rundownID,
    },
  });

  const res = await db.asset.create({
    data: {
      name: fileName,
      type,
      rundown: {
        connect: rundown,
      },
      media: {
        create: {
          name: fileName,
          rawPath: "",
          durationSeconds: 0,
        },
      },
      loadJobs: {
        create: {
          sourceType: "Tus",
          source: uploadURL.replace(
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
      loadJobs: true,
    },
  });
  await db.rundown.update({
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

  await dispatchJobForJobrunner(res.loadJobs[0].base_job_id);
  revalidatePath(`/shows/${rundown.showId}/rundown/${rundown.id}`);
  return { ok: true };
}

export async function removeAsset(assetID: number) {
  const res = await db.$transaction(async ($db) => {
    const res = await $db.asset.update({
      where: {
        id: assetID,
      },
      data: {
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
    await $db.asset.delete({
      where: {
        id: assetID,
      },
    });
    return res;
  });
  revalidatePath(`/shows/${res.rundown.showId}/rundown/${res.rundown.id}`);
  return { ok: true };
}

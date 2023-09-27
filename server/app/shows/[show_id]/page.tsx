import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { RundownOrContinuity } from "./types";
import { ShowItemsList } from "./ShowItemsList";
import { TusEndpointProvider } from "@/components/MediaUpload";
import { getTusEndpoint } from "@/lib/tus";
import { DateTime } from "@/components/DateTIme";
import { MetadataFields } from "@/components/Metadata";
import { MetadataTargetType } from "@bowser/prisma/client";
import { addMeta, setMetaValue } from "./actions";

export default async function ShowPage(props: { params: { show_id: string } }) {
  const show = await db.show.findFirst({
    where: {
      id: parseInt(props.params.show_id, 10),
    },
    include: {
      rundowns: {
        include: {
          items: true,
        },
      },
      continuityItems: {
        include: {
          media: {
            include: {
              tasks: true,
            },
          },
        },
      },
      metadata: {
        include: {
          field: true,
        },
        orderBy: {
          fieldId: "asc",
        },
      },
    },
  });
  if (!show) {
    notFound();
  }
  const metaFields = await db.metadataField.findMany({
    where: {
      target: MetadataTargetType.Show,
      archived: false,
    },
    orderBy: {
      id: "asc",
    },
  });
  const items: RundownOrContinuity[] = (
    show.rundowns.map((r) => ({
      ...r,
      _type: "rundown",
    })) as RundownOrContinuity[]
  )
    .concat(
      show.continuityItems.map((c) => ({ ...c, _type: "continuity_item" })),
    )
    .sort((a, b) => a.order - b.order);
  return (
    <>
      <p>
        Start: <DateTime val={show.start.toUTCString()} />
      </p>
      <MetadataFields
        metadata={show.metadata}
        fields={metaFields}
        createMeta={async (fieldID, val) => {
          "use server";
          return addMeta(show.id, fieldID, val);
        }}
        setValue={async (metaID, val) => {
          "use server";
          return setMetaValue(show.id, metaID, val);
        }}
      />
      <TusEndpointProvider value={getTusEndpoint()}>
        <ShowItemsList show={show} items={items} />
      </TusEndpointProvider>
    </>
  );
}

"use client";

import {
  Media,
  MediaProcessingTask,
  MediaState,
  Rundown,
  RundownItem,
} from "@bowser/prisma/client";
import {
  DragDropContext,
  Draggable,
  Droppable,
  OnDragEndResponder,
} from "@hello-pangea/dnd";
import Form from "@/components/Form";
import {
  addItem,
  deleteItem,
  editItem,
  processUploadForRundownItem,
  reorder,
} from "./itemsActions";
import { AddItemSchema, EditItemSchema, ItemTypeSchema } from "./schema";
import {
  DurationField,
  Field,
  HiddenField,
  SelectField,
} from "@/components/FormFields";
import { identity } from "lodash";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useTransition,
} from "react";
import Button from "@bowser/components/button";
import { useRouter } from "next/navigation";
import { ItemMediaStateAndUploadDialog } from "@/components/MediaState";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bowser/components/popover";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@bowser/components/table";
import { formatDurationMS } from "@/lib/time";

export interface MediaWithTasks extends Media {
  tasks: MediaProcessingTask[];
}

export interface ItemWithMedia extends RundownItem {
  media: MediaWithTasks | null;
}

export interface CompleteRundown extends Rundown {
  items: ItemWithMedia[];
}

function AddSegment(props: { rundown: CompleteRundown }) {
  const nameRef = useRef<HTMLElement>(null);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="dark">Add Segment</Button>
      </PopoverTrigger>
      <PopoverContent>
        <Form
          action={addItem}
          schema={AddItemSchema}
          onSuccess={(_, form) => {
            form.reset();
            nameRef.current?.focus();
          }}
        >
          <HiddenField
            name="showID"
            value={props.rundown.showId.toString(10)}
          />
          <HiddenField name="rundownID" value={props.rundown.id.toString(10)} />
          <Field name="name" label="Name" ref={nameRef} />
          <SelectField
            name="type"
            label="Type"
            options={Object.keys(ItemTypeSchema.enum)}
            renderOption={identity}
            getOptionValue={identity}
            filter={false}
          />
          <DurationField
            name="durationSeconds"
            label="Duration"
            units="seconds"
          />
        </Form>
      </PopoverContent>
    </Popover>
  );
}

function EditItem(props: {
  showID: number;
  rundownID: number;
  item: RundownItem;
  done?: () => void;
}) {
  return (
    <Form
      action={editItem}
      schema={EditItemSchema}
      initialValues={props.item}
      onSuccess={props.done}
      submitLabel="Save"
    >
      <HiddenField name="showID" value={props.showID.toString(10)} />
      <HiddenField name="rundownID" value={props.rundownID.toString(10)} />
      <HiddenField name="itemID" value={props.item.id.toString(10)} />
      <Field name="name" label="Name" />
      <SelectField
        name="type"
        label="type"
        options={Object.keys(ItemTypeSchema.enum)}
        renderOption={identity}
        getOptionValue={identity}
        filter={false}
      />
      <DurationField name="durationSeconds" label="Duration" units="seconds" />
    </Form>
  );
}

function ItemsTable(props: { rundown: CompleteRundown }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [optimisticItems, doOptimisticMove] = useOptimistic(
    props.rundown.items,
    (oldItems, act: { id: number; newOrder: number }) => {
      const items = [...oldItems];
      const item = items.find((i) => i.id === act.id);
      if (!item) {
        return items;
      }
      const oldOrder = item.order;
      if (oldOrder > act.newOrder) {
        for (let i = act.newOrder; i < oldOrder; i++) {
          items[i].order++;
        }
      } else {
        for (let i = oldOrder + 1; i <= act.newOrder; i++) {
          items[i].order--;
        }
      }
      item.order = act.newOrder;
      items.sort((a, b) => a.order - b.order);
      return items;
    },
  );

  const doMove: OnDragEndResponder = useCallback(
    (ev) => {
      if (!ev.destination) {
        return;
      }
      doOptimisticMove({
        id: parseInt(ev.draggableId, 10),
        newOrder: ev.destination!.index,
      });
      startTransition(async () => {
        await reorder(
          props.rundown.id,
          parseInt(ev.draggableId, 10),
          ev.destination!.index,
        );
      });
    },
    [props.rundown.id, doOptimisticMove],
  );

  // Periodically refresh if any items are pending
  const intervalRef = useRef<NodeJS.Timer | null>(null);
  useEffect(() => {
    const anyPending = props.rundown.items.some(
      (x) =>
        x.media?.state === MediaState.Pending ||
        x.media?.state === MediaState.Processing,
    );
    if (!anyPending) {
      return;
    }
    intervalRef.current = setInterval(() => {
      router.refresh();
    }, 2500);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [props.rundown.items, router]);

  const [items, runtimeSeconds] = useMemo(() => {
    const items = [];
    let runningDurationSeconds = 0;
    for (let idx = 0; idx < optimisticItems.length; idx++) {
      const item = optimisticItems[idx];
      runningDurationSeconds += item.durationSeconds;
      // Ensure the render prop closes over the current value of runningDurationSeconds
      const dur = runningDurationSeconds;

      items.push(
        <Draggable
          key={item.id}
          draggableId={item.id.toString()}
          index={idx}
          isDragDisabled={isPending}
        >
          {(provided) => (
            <TableRow {...provided.draggableProps} ref={provided.innerRef}>
              <TableCell
                {...provided.dragHandleProps}
                className="text-2xl px-4"
              >
                ☰
              </TableCell>
              <TableCell className="font-bold">{item.name}</TableCell>
              <TableCell>
                {item.type === "VT" && (
                  <ItemMediaStateAndUploadDialog
                    item={item}
                    onUploadComplete={async (url, fileName) =>
                      processUploadForRundownItem(item.id, fileName, url)
                    }
                  />
                )}
              </TableCell>
              <TableCell>
                {formatDurationMS(item.durationSeconds * 1000)}
              </TableCell>
              <TableCell>{formatDurationMS(dur * 1000)}</TableCell>
              <TableCell>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button>Edit</Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <EditItem
                      showID={props.rundown.showId}
                      rundownID={props.rundown.id}
                      item={item}
                    />
                  </PopoverContent>{" "}
                </Popover>
              </TableCell>
              <TableCell className="pr-4">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button color="danger">Delet</Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <Button
                      color="danger"
                      onClick={() => {
                        startTransition(async () => {
                          await deleteItem(props.rundown.id, item.id);
                        });
                      }}
                      disabled={isPending}
                    >
                      You sure boss?
                    </Button>
                  </PopoverContent>
                </Popover>
              </TableCell>
            </TableRow>
          )}
        </Draggable>,
      );
    }
    return [items, runningDurationSeconds];
  }, [optimisticItems, isPending, props.rundown.id, props.rundown.showId]);

  return (
    <>
      <DragDropContext onDragEnd={doMove}>
        <Droppable droppableId="0">
          {(provided) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead />
                  <TableHead>Duration</TableHead>
                  <TableHead>Running Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                {items}
                {provided.placeholder}
              </TableBody>
              <TableCaption>
                <strong>Total runtime:</strong>{" "}
                {formatDurationMS(runtimeSeconds * 1000)}
              </TableCaption>
            </Table>
          )}
        </Droppable>
      </DragDropContext>
    </>
  );
}

export function RundownItems(props: { rundown: CompleteRundown }) {
  return (
    <div>
      <h2 className="text-xl">Rundown</h2>
      <ItemsTable rundown={props.rundown} />
      <AddSegment rundown={props.rundown} />
    </div>
  );
}

import { z } from "zod";
import { proc, r } from "../base/ipcRouter";
import { getOntimeSettings, ontimeSettingsSchema } from "../base/settings";
import { selectedShow } from "../base/selectedShow";
import invariant from "../../common/invariant";
import { showToOntimeEvents } from "./ontimeHelpers";
import { getLogger } from "../base/logging";
import { OntimeIntegration } from "./ontime";

const logger = getLogger("ontime/ipc");

export const ontimeRouter = r({
  getSettings: proc.output(ontimeSettingsSchema.nullable()).query(async () => {
    return getOntimeSettings();
  }),
  getConnectionStatus: proc
    .output(z.object({ host: z.string() }).nullable())
    .query(async () => {
      if (!OntimeIntegration.maybeInstance) {
        return null;
      }
      return { host: OntimeIntegration.instance.host };
    }),
  connect: proc
    .input(ontimeSettingsSchema)
    .output(z.boolean())
    .mutation(async ({ input }) => {
      await OntimeIntegration.start(input);
      return true;
    }),
  pushEvents: proc
    .input(
      z.object({
        rundownId: z.number().optional(),
        replacementMode: z.enum(["force"]).optional(),
      }),
    )
    .output(
      z.object({
        done: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const show = selectedShow.value;
      invariant(show, "No show selected");
      const events = showToOntimeEvents(show, input.rundownId);
      logger.debug("Ready for Ontime push");
      logger.debug(events);

      const current = await OntimeIntegration.instance.getEvents();
      if (input.replacementMode === "force" || current.length === 0) {
        const ontime = OntimeIntegration.instance;
        await ontime.deleteAllEvents();
        // Not in a Promise.all to ensure they're done in order
        // NB: A new event is added to the *top* of the rundown in Ontime, so we need to add them in reverse order
        for (const event of events.reverse()) {
          await ontime.createEvent(event);
        }
        return { done: true };
      }

      if (current.length !== events.length) {
        return { done: false };
      }
      for (let i = 0; i < current.length; i++) {
        if (events[i] && current[i].title !== events[i].title) {
          return { done: false };
        }
      }
      return { done: true };
    }),
});

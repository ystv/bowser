import {
  CreateTRPCClientOptions,
  createTRPCProxyClient,
  loggerLink,
} from "@trpc/client";
import { ipcLink } from "electron-trpc/renderer";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../main/ipcApi";
import { Events } from "../common/ipcEvents";
import { QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import logging from "loglevel";
import { observable, tap } from "@trpc/server/observable";

const logger = logging.getLogger("serverIPC");

export const ipc = createTRPCReact<AppRouter>();

const clientConfig: CreateTRPCClientOptions<AppRouter> = {
  links: [
    (_) =>
      ({ op, next }) => {
        // We need to be exceedingly careful here to not cause an infinite loop
        if (op.path === "log") {
          return next(op);
        }
        return observable((observer) => {
          ipcProxy.log.mutate({
            level: "trace",
            message: `<-- ${op.type} ${op.path}`,
          });
          const unsubscribe = next(op).subscribe({
            next: (res) => {
              ipcProxy.log.mutate({
                level: "trace",
                message: `--> ${op.type} ${op.path} data ${JSON.stringify(
                  res,
                )}`,
              });
              observer.next(res);
            },
            error: (err) => {
              ipcProxy.log.mutate({
                level: "error",
                message: `--> ${op.type} ${op.path} ${err}`,
              });
              observer.error(err);
            },
            complete: () => {
              observer.complete();
            },
          });
          return unsubscribe;
        });
      },
    ipcLink(),
  ],
};

const ipcProxy = createTRPCProxyClient<AppRouter>(clientConfig);

export const ipcClient = ipc.createClient(clientConfig);

const oldFactory = logging.methodFactory;
logging.methodFactory = function (levelName, level, logger) {
  return function (message) {
    oldFactory(levelName, level, logger)(message);
    ipcProxy.log.mutate({
      level: levelName,
      logger: typeof logger === "symbol" ? String(logger) : logger,
      message,
    });
  };
};

const { log, info, warn, error } = console;
window.console.log = (...args: unknown[]) => {
  log(...args);
  ipcProxy.log.mutate({ level: "debug", message: args.join(" ") });
};
window.console.info = (...args: unknown[]) => {
  info(...args);
  ipcProxy.log.mutate({ level: "info", message: args.join(" ") });
};
window.console.warn = (...args: unknown[]) => {
  warn(...args);
  ipcProxy.log.mutate({ level: "warn", message: args.join(" ") });
};
window.console.error = (...args: unknown[]) => {
  error(...args);
  ipcProxy.log.mutate({ level: "error", message: args.join(" ") });
};

window.onerror = (message, source, lineno, colno, error) => {
  ipcProxy.log.mutate({
    level: "error",
    message: `Uncaught exception: ${message} ${source} ${lineno} ${colno} ${error}`,
  });
};

// eslint-disable-next-line no-console
console.info("Renderer IPC logging initialised.");

export function useInvalidateQueryOnIPCEvent(
  query: QueryKey,
  event: keyof Events,
) {
  const qc = useQueryClient();
  useEffect(() => {
    const handler = () => {
      logger.debug(`Invalidating query ${query} due to IPC event ${event}`);
      qc.invalidateQueries(query);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.IPCEventBus.on(event as any, handler);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => window.IPCEventBus.off(event as any, handler);
  }, [query, event, qc]);
}

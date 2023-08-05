import AbstractJob from "./base.js";
import {
  Asset,
  LoadAssetJob as LoadAssetJobType,
  MediaFileSourceType,
  MediaState,
  Rundown,
} from "@prisma/client";
import path from "node:path";
import fs from "node:fs";
import got from "got";
import { pEvent } from "p-event";
import { pipeline as streamPipeline } from "node:stream/promises";
import { PutObjectCommand } from "@aws-sdk/client-s3";

interface AssetWithRundown extends Asset {
  rundown: Rundown;
}

export class LoadAssetJob extends AbstractJob<LoadAssetJobType> {
  constructor() {
    super();
  }

  async run(params: LoadAssetJobType): Promise<void> {
    await this.db.asset.update({
      where: {
        id: params.asset_id,
      },
      data: {
        state: MediaState.Processing,
      },
    });
    const fullJob = await this.db.loadAssetJob.findUniqueOrThrow({
      where: {
        id: params.id,
      },
      include: {
        asset: {
          include: {
            rundown: true,
          },
        },
      },
    });
    try {
      const path = await this._downloadSourceFile(params);
      const res = await this._uploadFileToS3(path, fullJob.asset);
      await this.db.asset.update({
        where: {
          id: fullJob.asset.id,
        },
        data: {
          state: MediaState.Ready,
          path: res,
        },
      });
    } catch (e) {
      await this.db.asset.update({
        where: {
          id: fullJob.asset.id,
        },
        data: {
          state: MediaState.ProcessingFailed,
        },
      });
      throw e;
    }
  }

  // TODO duplicated with ProcessMediaJob
  private async _downloadSourceFile(params: LoadAssetJobType) {
    const filePath = path.join(this.temporaryDir, "raw");
    const output = fs.createWriteStream(filePath);
    let stream: NodeJS.ReadableStream;
    switch (params.sourceType) {
      case MediaFileSourceType.Tus:
        stream = got.stream.get(process.env.TUS_ENDPOINT + "/" + params.source);
        await pEvent(stream, "response"); // this ensures that any errors are thrown
        break;

      case MediaFileSourceType.GoogleDrive:
        const res = await this.driveClient.files.get(
          {
            fileId: params.source,
            alt: "media",
          },
          {
            responseType: "stream",
          },
        );
        stream = res.data;
        break;

      default:
        throw new Error("Unknown source type");
    }
    await streamPipeline(stream, output);
    return filePath;
  }

  private async _uploadFileToS3(path: string, asset: AssetWithRundown) {
    const stream = fs.createReadStream(path);
    const s3Path = `shows/${asset.rundown.showId}/rundown/${asset.rundown.id}/assets/${asset.id} - ${asset.name}`;
    const command = new PutObjectCommand({
      Bucket: process.env.STORAGE_BUCKET,
      Key: s3Path,
      Body: stream,
    });
    await this.s3Client.send(command);
    return s3Path;
  }
}
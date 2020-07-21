import { BlobService } from "azure-storage";
import * as parse from "csv-parse";
import { left, right, toError } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import {
  fromEither,
  fromLeft,
  fromPredicate,
  TaskEither,
  taskify,
  tryCatch
} from "fp-ts/lib/TaskEither";
import {
  getBlobAsText,
  upsertBlobFromText
} from "io-functions-commons/dist/src/utils/azure_storage";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import nodeFetch from "node-fetch";

export type StringMatrix = ReadonlyArray<ReadonlyArray<string>>;

const parsingTask = taskify<
  Buffer | string,
  parse.Options,
  Error,
  StringMatrix
>((a, b, cb) => parse(a, b, cb));

export const parseCsv = (
  content: string,
  options: parse.Options
): TaskEither<Error, StringMatrix> => parsingTask(content, options);

export const getCsvFromURL = (url: NonEmptyString): TaskEither<Error, string> =>
  tryCatch(() => nodeFetch(url), toError)
    .chain(
      fromPredicate(
        p => p.status >= 200 && p.status < 300,
        () => new Error("Error fetching file from remote URL")
      )
    )
    .chain(p => tryCatch(() => p.text(), toError));

export const getFileFromBlob = (
  blobService: BlobService,
  containerName: NonEmptyString,
  blobName: NonEmptyString
): TaskEither<Error, Option<string>> =>
  tryCatch(
    () => getBlobAsText(blobService, containerName, blobName).then(e => e),
    toError
  ).foldTaskEither(
    err => fromLeft(err),
    _ => fromEither(_.fold(err => left(err), __ => right(__)))
  );

export const writeBlobFromJson = (
  blobService: BlobService,
  containerName: NonEmptyString,
  blobName: NonEmptyString,
  textContent: NonEmptyString
): TaskEither<Error, Option<BlobService.BlobResult>> =>
  tryCatch(
    () =>
      upsertBlobFromText(
        blobService,
        containerName,
        blobName,
        textContent
      ).then(e => e),
    toError
  ).foldTaskEither(
    err => fromLeft(err),
    _ => fromEither(_.fold(err => left(err), __ => right(__)))
  );

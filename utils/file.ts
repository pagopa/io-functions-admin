import { BlobService } from "azure-storage";
import * as parse from "csv-parse";
import { left, right, toError } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import {
  fromEither,
  TaskEither,
  taskify,
  tryCatch
} from "fp-ts/lib/TaskEither";
import {
  getBlobAsText,
  upsertBlobFromText
} from "io-functions-commons/dist/src/utils/azure_storage";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import * as request from "request";

export type StringMatrix = ReadonlyArray<ReadonlyArray<string>>;

const parsingTask = taskify<
  Buffer | string,
  parse.Options,
  Error,
  StringMatrix
>((a, b, cb) => parse(a, b, cb));

const getCsvTask = taskify<
  string,
  | request.UriOptions & request.CoreOptions
  | request.UrlOptions & request.CoreOptions,
  Error,
  request.Response
>((a, b, cb) => request.get(a, b, cb));

export const parseCsv = (
  content: string,
  options: parse.Options
): TaskEither<Error, StringMatrix> => parsingTask(content, options);

export const getCsvFromURL = (
  url: NonEmptyString,
  options:
    | (request.UriOptions & request.CoreOptions)
    | (request.UrlOptions & request.CoreOptions)
): TaskEither<Error, string> =>
  getCsvTask(url, options).map(response =>
    Buffer.from(response.body).toString()
  );

export const getFileFromBlob = (
  blobService: BlobService,
  containerName: NonEmptyString,
  blobName: NonEmptyString
): TaskEither<Error, Option<string>> =>
  tryCatch(
    () => getBlobAsText(blobService, containerName, blobName).then(e => e),
    toError
  ).foldTaskEither(
    err => fromEither(left(err)),
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
    err => fromEither(left(err)),
    _ => fromEither(_.fold(err => left(err), __ => right(__)))
  );

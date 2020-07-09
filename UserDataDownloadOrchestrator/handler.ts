import { IFunctionContext } from "durable-functions/lib/src/classes";
import { isLeft } from "fp-ts/lib/Either";
import { UserDataProcessingChoiceEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessing } from "io-functions-commons/dist/src/models/user_data_processing";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";

const logPrefix = "UserDataDownloadOrchestrator";

// models the subset of UserDataProcessing documents that this orchestrator accepts
export type ProcessableUserDataProcessing = t.TypeOf<
  typeof ProcessableUserDataProcessing
>;
export const ProcessableUserDataProcessing = t.intersection([
  UserDataProcessing,
  // ony the subset of UserDataProcessing documents
  // with the following characteristics must be processed
  t.interface({
    choice: t.literal(UserDataProcessingChoiceEnum.DOWNLOAD),
    status: t.literal(UserDataProcessingStatusEnum.PENDING)
  })
]);

const CosmosDbDocumentCollection = t.readonlyArray(t.readonly(t.UnknownRecord));
type CosmosDbDocumentCollection = t.TypeOf<typeof CosmosDbDocumentCollection>;

export const handler = function*(
  context: IFunctionContext
): IterableIterator<unknown> {
  const input = context.df.getInput();
  const subTasks = CosmosDbDocumentCollection.decode(input)
    .getOrElseL(err => {
      throw Error(`${logPrefix}: cannot decode input [${readableReport(err)}]`);
    })
    .map(doc => ProcessableUserDataProcessing.decode(doc))
    .reduce(
      (documents, maybeProcessable) => {
        if (isLeft(maybeProcessable)) {
          context.log.warn(
            `${logPrefix}: skipping document [${readableReport(
              maybeProcessable.value
            )}]`
          );
          return documents;
        }
        return [...documents, maybeProcessable.value];
      },
      [] as readonly ProcessableUserDataProcessing[]
    )
    .map(processableDoc =>
      context.df.callSubOrchestrator(
        "UserDataDownloadSubOrchestrator",
        processableDoc
      )
    );

  context.log.info(
    `${logPrefix}: processing ${subTasks.length} document${
      subTasks.length === 1 ? "" : "s"
    }`
  );
  const result = yield context.df.Task.all(subTasks);
  context.log.info(`${logPrefix}: processed ${JSON.stringify(result)}`);
};

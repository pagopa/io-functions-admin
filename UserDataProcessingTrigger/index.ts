import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { task } from "fp-ts/lib/Task";
import { UserDataProcessingChoiceEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessing } from "io-functions-commons/dist/src/models/user_data_processing";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";

const logPrefix = "UserDataProcessingTrigger";

// models the subset of UserDataProcessing documents that this orchestrator accepts
export type ProcessableUserDataDownload = t.TypeOf<
  typeof ProcessableUserDataDownload
>;
export const ProcessableUserDataDownload = t.intersection([
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

interface ITaskDescriptor {
  orchestrator: string;
  input: ProcessableUserDataDownload;
}

export default (context: Context, input: unknown) => {
  const dfClient = df.getClient(context);
  const tasksDescriptors = CosmosDbDocumentCollection.decode(input)
    .getOrElseL(err => {
      throw Error(`${logPrefix}: cannot decode input [${readableReport(err)}]`);
    })
    .reduce(
      (tasks, maybeProcessable) => {
        if (ProcessableUserDataDownload.is(maybeProcessable)) {
          return [
            ...tasks,
            {
              input: maybeProcessable,
              orchestrator: "UserDataDownloadOrchestrator"
            }
          ];
        } else {
          context.log.warn(
            `${logPrefix}: skipping document [${JSON.stringify(
              maybeProcessable
            )}]`
          );
          return tasks;
        }
      },
      [] as readonly ITaskDescriptor[]
    );

  context.log.info(
    `${logPrefix}: processing ${tasksDescriptors.length} document${
      tasksDescriptors.length === 1 ? "" : "s"
    }`
  );

  const startAllNew = () =>
    tasksDescriptors.map(({ orchestrator, input: orchestratorInput }) =>
      dfClient.startNew(orchestrator, undefined, orchestratorInput)
    );

  return Promise.all(startAllNew());
};

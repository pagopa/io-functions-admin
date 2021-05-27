import * as express from "express";
import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import {
  UserDataProcessing,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { taskEither, tryCatch } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { DurableOrchestrationClient } from "durable-functions/lib/src/durableorchestrationclient";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import {
  asyncIteratorToArray,
  flattenAsyncIterator
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import { array } from "fp-ts/lib/Array";
import { IResponseSuccessJson } from "@pagopa/ts-commons/lib/responses";
import { ResponseSuccessJson } from "@pagopa/ts-commons/lib/responses";
import { identity } from "fp-ts/lib/function";
import { isOrchestratorRunning } from "../utils/orchestrator";

const logPrefix = "UserDataProcessingProcessFailedRecordsHandler";

type IGetFailedUserDataProcessingHandlerResult =
  | IResponseSuccessJson<ReadonlyArray<string>>
  | IResponseErrorQuery;

type IGetFailedUserDataProcessingHandler = (
  context: Context
) => Promise<IGetFailedUserDataProcessingHandlerResult>;

const startOrchestrator = async (
  dfClient: DurableOrchestrationClient,
  orchestratorName: "UserDataProcessingRecoveryOrchestrator",
  orchestratorId: string,
  orchestratorInput: unknown
): Promise<string> =>
  isOrchestratorRunning(dfClient, orchestratorId)
    .fold(
      error => {
        throw error;
      },
      _ =>
        _.isRunning
          ? orchestratorId
          : dfClient.startNew(
              orchestratorName,
              orchestratorId,
              orchestratorInput
            )
    )
    .run();

const makeOrchestratorId = (
  choice: UserDataProcessingChoiceEnum,
  fiscalCode: FiscalCode
): string => `${choice}-${fiscalCode}-FAILED-USER-DATA-PROCESSING-RECOVERY`;

const startUserDataProcessingRecoveryOrchestrator = async (
  context: Context,
  processable: UserDataProcessing
): Promise<string> => {
  const dfClient = df.getClient(context);
  context.log.info(
    `${logPrefix}: starting UserDataProcessingRecoveryOrchestrator for ${processable.choice}-${processable.fiscalCode}`
  );
  const orchestratorId = makeOrchestratorId(
    processable.choice,
    processable.fiscalCode
  );
  return await startOrchestrator(
    dfClient,
    "UserDataProcessingRecoveryOrchestrator",
    orchestratorId,
    processable
  );
};

export const processFailedUserDataProcessingHandler = (
  userDataProcessingModel: UserDataProcessingModel
): IGetFailedUserDataProcessingHandler => async (
  context: Context
): Promise<IGetFailedUserDataProcessingHandlerResult> => {
  const listOfFailedUserDataProcessing = new Set<string>();
  return await tryCatch(
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async () =>
      userDataProcessingModel
        .getQueryIterator({
          parameters: [
            {
              name: "@status",
              value: "FAILED"
            }
          ],
          query: `SELECT * FROM m WHERE m.status = @status`
        })
        [Symbol.asyncIterator](),
    toCosmosErrorResponse
  )
    .map(flattenAsyncIterator)
    .map(asyncIteratorToArray)
    .chain(i => tryCatch(() => i, toCosmosErrorResponse))
    .chain(i =>
      array.sequence(taskEither)(
        i
          .map(v =>
            tryCatch(
              async () => {
                if (v.isLeft()) {
                  return;
                }

                if (
                  listOfFailedUserDataProcessing.has(
                    v.value.userDataProcessingId
                  )
                ) {
                  return;
                }

                listOfFailedUserDataProcessing.add(
                  v.value.userDataProcessingId
                );
                return startUserDataProcessingRecoveryOrchestrator(
                  context,
                  v.value
                );
              },
              e => {
                context.log.error(`${logPrefix}|ERROR|${e}`);
                return toCosmosErrorResponse(e);
              }
            )
          )
          .filter(identity)
      )
    )
    .fold<IGetFailedUserDataProcessingHandlerResult>(
      failure => ResponseErrorQuery(failure.kind, failure),
      success => ResponseSuccessJson(success)
    )
    .run();
};

export const processFailedUserDataProcessing = (
  userDataProcessingModel: UserDataProcessingModel
): express.RequestHandler => {
  const handler = processFailedUserDataProcessingHandler(
    userDataProcessingModel
  );

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware()
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};

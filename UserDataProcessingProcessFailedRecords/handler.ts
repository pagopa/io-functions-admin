import * as express from "express";
import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import {
  IResponseSuccessAccepted,
  ResponseSuccessAccepted
} from "@pagopa/ts-commons/lib/responses";
import {
  UserDataProcessing,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { tryCatch } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { DurableOrchestrationClient } from "durable-functions/lib/src/durableorchestrationclient";
import { isOrchestratorRunning } from "../utils/orchestrator";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { Validation } from "fp-ts/lib/Validation";

const logPrefix = "UserDataProcessingProcessFailedRecordsHandler";

type IGetFailedUserDataProcessingHandlerResult =
  | IResponseErrorQuery
  | IResponseSuccessAccepted;

type IGetFailedUserDataProcessingHandler = (
  context: Context
) => Promise<IGetFailedUserDataProcessingHandlerResult>;

const startOrchestrator = async (
  dfClient: DurableOrchestrationClient,
  orchestratorName: "UserDataProcessingRecoveryOrchestrator",
  orchestratorId: string,
  orchestratorInput: unknown
) =>
  isOrchestratorRunning(dfClient, orchestratorId)
    .fold(
      error => {
        throw error;
      },
      _ =>
        !_.isRunning
          ? dfClient.startNew(
              orchestratorName,
              orchestratorId,
              orchestratorInput
            )
          : null
    )
    .run();

export const makeOrchestratorId = (
  choice: UserDataProcessingChoiceEnum,
  fiscalCode: FiscalCode
): string => `${choice}-${fiscalCode}-FAILED-USER-DATA-PROCESSING-RECOVERY`;

const startUserDataProcessingRecoveryOrchestrator = (
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
  return startOrchestrator(
    dfClient,
    "UserDataProcessingRecoveryOrchestrator",
    orchestratorId,
    processable
  );
};

export const processFailedUserDataProcessingHandler = (
  userDataProcessingModel: UserDataProcessingModel
): IGetFailedUserDataProcessingHandler => {
  return async context => {
    return tryCatch(
      async () =>
        userDataProcessingModel.getQueryIterator({
          parameters: [
            {
              name: "@status",
              value: "FAILED"
            }
          ],
          query: `SELECT * FROM m WHERE m.status = @status`
        }),
      toCosmosErrorResponse
    )
      .map(async i => {
        for await (const failedUserDataProcessingList of i) {
          failedUserDataProcessingList.forEach(failedUserDataProcessing => {
            failedUserDataProcessing.map(async udp => {
              await startUserDataProcessingRecoveryOrchestrator(context, udp);
            });
          });
        }
      })
      .fold<IGetFailedUserDataProcessingHandlerResult>(
        e => ResponseErrorQuery(`COSMOS|ERROR|${e.error}`, e),
        s =>
          ResponseSuccessAccepted(
            "SUCCESS|Processing failed user data processing requests"
          )
      )
      .run();
  };
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

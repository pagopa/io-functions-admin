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
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { DurableOrchestrationClient } from "durable-functions/lib/src/durableorchestrationclient";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import {
  asyncIteratorToArray,
  flattenAsyncIterator
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as A from "fp-ts/lib/Array";
import { IResponseSuccessJson } from "@pagopa/ts-commons/lib/responses";
import { ResponseSuccessJson } from "@pagopa/ts-commons/lib/responses";
import { pipe } from "fp-ts/lib/function";
import { isOrchestratorRunning } from "../utils/orchestrator";

const logPrefix = "UserDataProcessingProcessFailedRecordsHandler";

type IGetFailedUserDataProcessingHandlerResult =
  | IResponseSuccessJson<ReadonlyArray<string | undefined>>
  | IResponseErrorQuery;

type IGetFailedUserDataProcessingHandler = (
  context: Context
) => Promise<IGetFailedUserDataProcessingHandlerResult>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const startOrchestrator = async (
  dfClient: DurableOrchestrationClient,
  orchestratorName: "UserDataProcessingRecoveryOrchestrator",
  orchestratorId: string,
  orchestratorInput: unknown
): Promise<string> =>
  pipe(
    isOrchestratorRunning(dfClient, orchestratorId),
    TE.chain(_ =>
      !_.isRunning
        ? TE.tryCatch(
            () =>
              dfClient.startNew(
                orchestratorName,
                orchestratorId,
                orchestratorInput
              ),
            E.toError
          )
        : // if the orchestrator is already running, just return the id
          TE.of(orchestratorId)
    ),

    // if something wrong, just raise the error
    TE.mapLeft(error => {
      throw error;
    }),
    TE.toUnion
  )();

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
  return pipe(
    TE.tryCatch(
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
    ),
    TE.map(flattenAsyncIterator),
    TE.map(asyncIteratorToArray),
    // type lift from promise to task either
    TE.chain(i => TE.tryCatch(() => i, toCosmosErrorResponse)),
    TE.chain(i =>
      A.sequence(TE.ApplicativePar)(
        i
          .map(v =>
            TE.tryCatch(
              async () => {
                if (E.isLeft(v)) {
                  return;
                }

                if (
                  listOfFailedUserDataProcessing.has(
                    v.right.userDataProcessingId
                  )
                ) {
                  return;
                }

                listOfFailedUserDataProcessing.add(
                  v.right.userDataProcessingId
                );
                return startUserDataProcessingRecoveryOrchestrator(
                  context,
                  v.right
                );
              },
              e => {
                context.log.error(`${logPrefix}|ERROR|${e}`);
                return toCosmosErrorResponse(e);
              }
            )
          )
          .filter(Boolean)
      )
    ),
    TE.mapLeft(failure => ResponseErrorQuery(failure.kind, failure)),
    TE.map(success => ResponseSuccessJson(success)),
    TE.toUnion
  )();
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

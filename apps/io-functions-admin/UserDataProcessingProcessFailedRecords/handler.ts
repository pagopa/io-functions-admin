import { InvocationContext } from "@azure/functions";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import {
  UserDataProcessing,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import {
  asyncIteratorToArray,
  flattenAsyncIterator
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import { IResponseSuccessJson } from "@pagopa/ts-commons/lib/responses";
import { ResponseSuccessJson } from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as df from "durable-functions";
import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import { isOrchestratorRunning } from "../utils/orchestrator";

const logPrefix = "UserDataProcessingProcessFailedRecordsHandler";

type IGetFailedUserDataProcessingHandler = (
  context: InvocationContext
) => Promise<IGetFailedUserDataProcessingHandlerResult>;

type IGetFailedUserDataProcessingHandlerResult =
  | IResponseErrorQuery
  | IResponseSuccessJson<readonly (string | undefined)[]>;

const startOrchestrator = async (
  dfClient: df.DurableClient,
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
              dfClient.startNew(orchestratorName, {
                input: orchestratorInput,
                instanceId: orchestratorId
              }),
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
  context: InvocationContext,
  processable: UserDataProcessing
): Promise<string> => {
  const dfClient = df.getClient(context);
  context.log(
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

export const processFailedUserDataProcessingHandler =
  (
    userDataProcessingModel: UserDataProcessingModel
  ): IGetFailedUserDataProcessingHandler =>
  async (
    context: InvocationContext
  ): Promise<IGetFailedUserDataProcessingHandlerResult> => {
    const listOfFailedUserDataProcessing = new Set<string>();
    return pipe(
      TE.tryCatch(
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
                  context.error(`${logPrefix}|ERROR|${e}`);
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
) => {
  const handler = processFailedUserDataProcessingHandler(
    userDataProcessingModel
  );

  const middlewares = [
    // Extract Azure Functions bindings
    ContextMiddleware()
  ] as const;

  return wrapHandlerV4(middlewares, handler);
};

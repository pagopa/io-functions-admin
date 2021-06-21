import * as express from "express";
import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  makeUserDataProcessingId,
  UserDataProcessing,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { fromLeft, TaskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessAccepted,
  ResponseSuccessAccepted,
  ResponseErrorInternal,
  ResponseErrorNotFound
} from "@pagopa/ts-commons/lib/responses";
import { identity } from "fp-ts/lib/function";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import { UserDataProcessingStatus } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { Option } from "fp-ts/lib/Option";

const logPrefix = "SetUserDataProcessingProcessStatusHandler";

type Response = ResponseSuccess | ResponseError;

type ResponseSuccess = IResponseSuccessAccepted;

type ResponseError = IResponseErrorInternal | IResponseErrorNotFound;

type IHttpHandler = (
  context: Context,
  param1: UserDataProcessingChoice,
  param2: FiscalCode,
  param3: UserDataProcessingStatus
) => Promise<Response>;

export const setUserDataProcessingStatusHandler = (
  userDataProcessingModel: UserDataProcessingModel
): IHttpHandler => async (
  _,
  choice,
  fiscalCode,
  newStatus
): Promise<Response> => {
  const findLastVersionByModelIdTask: TaskEither<
    Response,
    Option<UserDataProcessing>
  > = userDataProcessingModel
    .findLastVersionByModelId([
      makeUserDataProcessingId(choice, fiscalCode),
      fiscalCode
    ])
    .mapLeft(e => ResponseErrorInternal(e.kind));

  const updateStatusTask: (
    a: UserDataProcessing
  ) => TaskEither<Response, UserDataProcessing> = (
    lastVersionedUserDataProcessing: UserDataProcessing
  ) =>
    userDataProcessingModel
      .createOrUpdateByNewOne({
        ...lastVersionedUserDataProcessing,
        status: newStatus,
        updatedAt: new Date()
      })
      .mapLeft(e => ResponseErrorInternal(e.kind));

  return findLastVersionByModelIdTask
    .mapLeft(identity)
    .chain(o =>
      o
        .map(updateStatusTask)
        .getOrElse(
          fromLeft(
            ResponseErrorNotFound("Not Found", "No user data processing found")
          )
        )
    )
    .map<IResponseSuccessAccepted>(s => ResponseSuccessAccepted())
    .mapLeft(identity)
    .fold(identity, identity)
    .run();
};

export const setUserDataProcessingStatus = (
  serviceModel: ServiceModel,
  userDataProcessingModel: UserDataProcessingModel
): express.RequestHandler => {
  const handler = setUserDataProcessingStatusHandler(userDataProcessingModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("choice", UserDataProcessingChoice),
    RequiredParamMiddleware("fiscalCode", FiscalCode),
    RequiredParamMiddleware("newStatus", UserDataProcessingStatus)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};

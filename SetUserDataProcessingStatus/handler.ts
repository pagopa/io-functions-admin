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
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { Option } from "fp-ts/lib/Option";
import * as t from "io-ts/lib/index";

export type Response = ResponseSuccess | ResponseError;

type ResponseSuccess = IResponseSuccessAccepted;

type ResponseError = IResponseErrorInternal | IResponseErrorNotFound;

const AllowedUserDataProcessingStatus = t.union([
  t.literal(UserDataProcessingStatusEnum.CLOSED),
  t.literal(UserDataProcessingStatusEnum.PENDING)
]);
type AllowedUserDataProcessingStatus = t.TypeOf<
  typeof AllowedUserDataProcessingStatus
>;

type IHttpHandler = (
  context: Context,
  userAttrs: IAzureUserAttributes,
  param1: UserDataProcessingChoice,
  param2: FiscalCode,
  param3: AllowedUserDataProcessingStatus
) => Promise<Response>;

export const setUserDataProcessingStatusHandler = (
  userDataProcessingModel: UserDataProcessingModel
): IHttpHandler => async (
  _,
  __,
  choice,
  fiscalCode,
  newStatus
): Promise<Response> =>
  AllowedUserDataProcessingStatus.decode(newStatus).fold(
    async ___ => ResponseErrorInternal("Status not allowed"),
    status => {
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
            status,
            updatedAt: new Date()
          })
          .mapLeft(e => ResponseErrorInternal(e.kind));

      return findLastVersionByModelIdTask
        .chain(maybeUserDataProcessing =>
          maybeUserDataProcessing
            .map(updateStatusTask)
            .getOrElse(
              fromLeft(
                ResponseErrorNotFound(
                  "Not Found",
                  "No user data processing found"
                )
              )
            )
        )
        .map<IResponseSuccessAccepted>(____ => ResponseSuccessAccepted())
        .fold(identity, identity)
        .run();
    }
  );

export const setUserDataProcessingStatus = (
  serviceModel: ServiceModel,
  userDataProcessingModel: UserDataProcessingModel
): express.RequestHandler => {
  const handler = setUserDataProcessingStatusHandler(userDataProcessingModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureUserAttributesMiddleware(serviceModel),
    RequiredParamMiddleware("choice", UserDataProcessingChoice),
    RequiredParamMiddleware("fiscalCode", FiscalCode),
    RequiredParamMiddleware("newStatus", AllowedUserDataProcessingStatus)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};

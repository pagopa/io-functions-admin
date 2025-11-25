import { Context } from "@azure/functions";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  makeUserDataProcessingId,
  UserDataProcessing,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessAccepted,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessAccepted
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import express from "express";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import { Option } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts/lib/index";

export type Response = ResponseError | ResponseSuccess;

type ResponseError = IResponseErrorInternal | IResponseErrorNotFound;

type ResponseSuccess = IResponseSuccessAccepted;

const AllowedUserDataProcessingStatus = t.union([
  t.literal(UserDataProcessingStatusEnum.CLOSED),
  t.literal(UserDataProcessingStatusEnum.PENDING)
]);
type AllowedUserDataProcessingStatus = t.TypeOf<
  typeof AllowedUserDataProcessingStatus
>;

type IHttpHandler = (
  context: Context,
  param1: UserDataProcessingChoice,
  param2: FiscalCode,
  param3: AllowedUserDataProcessingStatus
) => Promise<Response>;

export const setUserDataProcessingStatusHandler = (
  userDataProcessingModel: UserDataProcessingModel
): IHttpHandler => async (
  _,
  choice,
  fiscalCode,
  newStatus
): Promise<Response> =>
  pipe(
    newStatus,
    AllowedUserDataProcessingStatus.decode,
    E.mapLeft(() => ResponseErrorInternal("Status not allowed")),
    TE.fromEither,
    TE.chainW(status => {
      const findLastVersionByModelIdTask: TE.TaskEither<
        Response,
        Option<UserDataProcessing>
      > = pipe(
        userDataProcessingModel.findLastVersionByModelId([
          makeUserDataProcessingId(choice, fiscalCode),
          fiscalCode
        ]),
        TE.mapLeft(e => ResponseErrorInternal(e.kind))
      );

      const updateStatusTask: (
        a: UserDataProcessing
      ) => TE.TaskEither<Response, UserDataProcessing> = (
        lastVersionedUserDataProcessing: UserDataProcessing
      ) =>
        pipe(
          userDataProcessingModel.createOrUpdateByNewOne({
            ...lastVersionedUserDataProcessing,
            status,
            updatedAt: new Date()
          }),
          TE.mapLeft(e => ResponseErrorInternal(e.kind))
        );

      return pipe(
        findLastVersionByModelIdTask,
        TE.chainW(
          flow(
            O.map(updateStatusTask),
            O.getOrElseW(() =>
              TE.left(
                ResponseErrorNotFound(
                  "Not Found",
                  "No user data processing found"
                )
              )
            )
          )
        ),
        TE.map(() => ResponseSuccessAccepted<undefined>())
      );
    }),
    TE.toUnion
  )();

export const setUserDataProcessingStatus = (
  userDataProcessingModel: UserDataProcessingModel
): express.RequestHandler => {
  const handler = setUserDataProcessingStatusHandler(userDataProcessingModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("choice", UserDataProcessingChoice),
    RequiredParamMiddleware("fiscalCode", FiscalCode),
    RequiredParamMiddleware("newStatus", AllowedUserDataProcessingStatus)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};

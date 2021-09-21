// TODO:
//  this file must be deleted after the `withRequestMiddlewares` method will accept more than 6 params.
//  @see: https://www.pivotaltracker.com/story/show/171598976

import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";
import { sequenceT } from "fp-ts/lib/Apply";

import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import { IRequestMiddleware } from "@pagopa/ts-commons/lib/request_middleware";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { EmailAddress } from "../../generated/definitions/EmailAddress";

/**
 * A middleware that extracts a tuple of email address and subscription id from the request parameters
 */
export const CreateSubscriptionParamsMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  readonly [EmailAddress, NonEmptyString]
> = async request =>
  pipe(
    sequenceT(TE.ApplicativePar)(
      () => RequiredParamMiddleware("email", EmailAddress)(request),
      () => RequiredParamMiddleware("subscriptionId", NonEmptyString)(request)
    )
  )();

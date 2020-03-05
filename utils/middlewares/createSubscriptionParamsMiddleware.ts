// TODO:
//  this file must be deleted after the `withRequestMiddlewares` method will accept more than 6 params.
//  @see: https://www.pivotaltracker.com/story/show/171598976

import { sequenceT } from "fp-ts/lib/Apply";
import { Task } from "fp-ts/lib/Task";
import { TaskEither, taskEither } from "fp-ts/lib/TaskEither";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { EmailAddress } from "../../generated/definitions/EmailAddress";

/**
 * A middleware that extracts a tuple of email address and subscription id from the request parameters
 */
export const CreateSubscriptionParamsMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  readonly [EmailAddress, NonEmptyString]
> = request =>
  sequenceT(taskEither)(
    new TaskEither(
      new Task(() => RequiredParamMiddleware("email", EmailAddress)(request))
    ),
    new TaskEither(
      new Task(() =>
        RequiredParamMiddleware("subscriptionId", NonEmptyString)(request)
      )
    )
  ).run();

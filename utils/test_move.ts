/* eslint-disable functional/immutable-data */
/* eslint-disable @typescript-eslint/no-unused-expressions */
import { ApiManagementClient } from "@azure/arm-apimanagement";
import {
  SubscriptionGetResponse,
  UserContract,
  UserGetResponse
} from "@azure/arm-apimanagement/esm/models";
import { Either, isLeft, toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as T from "fp-ts/lib/Task";
import * as AR from "fp-ts/lib/Array";
import { groupContractToApiGroup } from "./conversions";
import {
  chainApimMappedError,
  getApiClient,
  getUserGroups,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "./apim";
import { azureApimConfig, servicePrincipalCreds } from "./test_config";

const getUserByEmail = (
  apimClient: ApiManagementClient,
  userEmail: string
): TE.TaskEither<Error, UserContract> =>
  pipe(
    TE.tryCatch(
      () =>
        apimClient.user.listByService(
          azureApimConfig.apimResourceGroup,
          azureApimConfig.apim,
          {
            filter: `email eq '${userEmail}'`
          }
        ),
      toError
    ),
    TE.chain(
      TE.fromPredicate(
        results => results.length > 0,
        () => new Error("Cannot find user by email")
      )
    ),
    TE.map(_ => _[0])
  );
const getUserById = (
  apimClient: ApiManagementClient,
  userId: string
): TE.TaskEither<Error, UserGetResponse> =>
  pipe(
    TE.tryCatch(
      () =>
        apimClient.user.get(
          azureApimConfig.apimResourceGroup,
          azureApimConfig.apim,
          userId
        ),
      toError
    )
  );

const getSubscription = (
  apimClient: ApiManagementClient,
  subscriptionId: string
): TE.TaskEither<Error, SubscriptionGetResponse> =>
  pipe(
    TE.tryCatch(
      () =>
        apimClient.subscription.get(
          azureApimConfig.apimResourceGroup,
          azureApimConfig.apim,
          subscriptionId
        ),
      toError
    )
  );

const getSubscriptionUserId = (
  apimClient: ApiManagementClient,
  subscriptionId: string
): TE.TaskEither<Error, string> =>
  pipe(
    getSubscription(apimClient, subscriptionId),
    TE.map(_ => _.ownerId.substring(_.ownerId.lastIndexOf("/") + 1))
  );

const updateSubscriptionOwner = (
  apimClient: ApiManagementClient,
  subscription: SubscriptionGetResponse,
  destinationOwnerId: string
): TE.TaskEither<Error, string> =>
  pipe(
    TE.tryCatch(
      () =>
        apimClient.subscription.createOrUpdate(
          azureApimConfig.apimResourceGroup,
          azureApimConfig.apim,
          subscription.name,
          {
            displayName: subscription.displayName,
            ownerId: destinationOwnerId,
            scope: subscription.scope
          }
        ),
      toError
    ),
    TE.map(
      () =>
        `Update subscription ${subscription.name} with ownerId ${destinationOwnerId}`
    )
  );

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const mergeFn = (te: T.Task<ReadonlyArray<Either<Error, string>>>) =>
  T.ApplicativePar.map(te, e =>
    e.reduce(
      (acc, cur) => {
        // our reducer is still pure, as we pass fresh object literal as initial value
        isLeft(cur)
          ? acc.errors.push(cur.left.message)
          : acc.results.push(cur.right);
        return acc;
      },
      { errors: [], results: [] }
    )
  );

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const testBySubId = (
  servicePrincipalCred: IServicePrincipalCreds,
  azureApimCfg: IAzureApimConfig,
  subscriptionId: string
) =>
  pipe(
    getApiClient(servicePrincipalCred, azureApimCfg.subscriptionId),
    TE.chain(apimClient =>
      pipe(
        getSubscriptionUserId(apimClient, subscriptionId),
        TE.chain(subscriptionOwnerId =>
          getUserById(apimClient, subscriptionOwnerId)
        ),

        TE.chain(user =>
          pipe(
            getUserGroups(
              apimClient,
              azureApimCfg.apimResourceGroup,
              azureApimCfg.apim,
              user.name
            ),
            TE.chain(groupContracts =>
              TE.fromEither(
                AR.traverse(E.Applicative)(groupContractToApiGroup)([
                  ...groupContracts
                ])
              )
            ),
            TE.map(groups => ({
              email: user.email,
              groups,
              id: user.id
            }))
          )
        )
      )
    )
  );

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const testBySubId2 = (
  servicePrincipalCred: IServicePrincipalCreds,
  azureApimCfg: IAzureApimConfig,
  subscriptionId: string
) =>
  pipe(
    getApiClient(servicePrincipalCred, azureApimCfg.subscriptionId),
    TE.chain(apimClient =>
      pipe(
        getSubscriptionUserId(apimClient, subscriptionId),
        TE.chain(subscriptionOwnerId =>
          getUserById(apimClient, subscriptionOwnerId)
        )
      )
    ),
    chainApimMappedError
  );

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const test = (
  servicePrincipalCred: IServicePrincipalCreds,
  azureApimCfg: IAzureApimConfig,
  servicesToMigrate: ReadonlyArray<string>,
  orig_email: string = "l.franceschin@gmail.com",
  dest_email: string = "postaforum@gmail.com"
) =>
  pipe(
    getApiClient(servicePrincipalCred, azureApimCfg.subscriptionId),
    TE.chain(apimClient =>
      pipe(
        getUserByEmail(apimClient, orig_email),
        TE.chain(origine =>
          pipe(
            getUserByEmail(apimClient, dest_email),
            TE.map(destinazione => ({ destinazione, origine }))
          )
        ),
        TE.chain(destOrig =>
          pipe(
            AR.sequence(T.ApplicativePar)(
              servicesToMigrate.map(serviceId =>
                pipe(
                  getSubscription(apimClient, serviceId),
                  TE.mapLeft(
                    e =>
                      new Error(
                        `ERROR|${e.message} SubscriptionId = ${serviceId}`
                      )
                  ),
                  TE.map(subscription => ({ ...destOrig, subscription })),
                  TE.chain(
                    TE.fromPredicate(
                      result =>
                        result.origine.id === result.subscription.ownerId,
                      res =>
                        new Error(
                          `ERROR|Subscription ${res.subscription.name} is not owned by ${res.origine.email}`
                        )
                    )
                  ),
                  TE.chain(_ =>
                    updateSubscriptionOwner(
                      apimClient,
                      _.subscription,
                      _.destinazione.id
                    )
                  )
                )
              )
            ),
            mergeFn,
            TE.fromTask
          )
        )
      )
    )
  );

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const run = () => {
  console.log(new Date());
  testBySubId2(
    servicePrincipalCreds,
    azureApimConfig,
    "01F3YTAWFFKVVQXS8G4RM4J69M"
  )()
    .then(_ => {
      console.log(new Date());
      console.log(_);
    })
    .catch(console.log);
};

run();

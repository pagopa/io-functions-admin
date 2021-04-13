import {
  GroupContract,
  SubscriptionContract,
  UserContract
} from "@azure/arm-apimanagement/esm/models";
import { Either } from "fp-ts/lib/Either";
import { Service as ApiService } from "io-functions-commons/dist/generated/definitions/Service";
import { ServiceMetadata as ApiServiceMetadata } from "io-functions-commons/dist/generated/definitions/ServiceMetadata";
import {
  RetrievedService,
  Service,
  toAuthorizedCIDRs,
  toAuthorizedRecipients
} from "io-functions-commons/dist/src/models/service";
import { VisibleService } from "io-functions-commons/dist/src/models/visible_service";
import { CosmosErrors } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { toApiServiceMetadata as toServiceMetadata } from "io-functions-commons/dist/src/utils/service_metadata";
import { Errors } from "io-ts";
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";
import { EmailString, FiscalCode } from "italia-ts-commons/lib/strings";
import { CIDR } from "../generated/definitions/CIDR";
import { Group, Group as ApiGroup } from "../generated/definitions/Group";
import {
  Subscription,
  Subscription as ApiSubscription
} from "../generated/definitions/Subscription";
import { User, User as ApiUser } from "../generated/definitions/User";
import { UserCreated as ApiUserCreated } from "../generated/definitions/UserCreated";
import { UserStateEnum } from "../generated/definitions/UserState";

/**
 * Converts an API Service to an internal Service model
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function apiServiceToService(service: ApiService): Service {
  return {
    authorizedCIDRs: toAuthorizedCIDRs(service.authorized_cidrs),
    authorizedRecipients: toAuthorizedRecipients(service.authorized_recipients),
    departmentName: service.department_name,
    isVisible: service.is_visible,
    maxAllowedPaymentAmount: service.max_allowed_payment_amount,
    organizationFiscalCode: service.organization_fiscal_code,
    organizationName: service.organization_name,
    requireSecureChannels: service.require_secure_channels,
    serviceId: service.service_id,
    serviceMetadata: service.service_metadata && {
      address: service.service_metadata.address,
      appAndroid: service.service_metadata.app_android,
      appIos: service.service_metadata.app_ios,
      cta: service.service_metadata.cta,
      description: service.service_metadata.description,
      email: service.service_metadata.email,
      pec: service.service_metadata.pec,
      phone: service.service_metadata.phone,
      privacyUrl: service.service_metadata.privacy_url,
      scope: service.service_metadata.scope,
      supportUrl: service.service_metadata.support_url,
      tokenName: service.service_metadata.token_name,
      tosUrl: service.service_metadata.tos_url,
      webUrl: service.service_metadata.web_url
    },
    serviceName: service.service_name
  };
}

// Returns an API Service Metadata from an internal Service model
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function toApiServiceMetadata(
  service: RetrievedService
): ApiServiceMetadata {
  return service.serviceMetadata
    ? toServiceMetadata(service.serviceMetadata)
    : undefined;
}

/**
 * Converts a RetrievedService to a API Service
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function retrievedServiceToApiService(
  retrievedService: RetrievedService
): ApiService {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    authorized_cidrs: Array.from(retrievedService.authorizedCIDRs).filter(
      CIDR.is
    ),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    authorized_recipients: Array.from(
      retrievedService.authorizedRecipients
    ).filter(FiscalCode.is),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    department_name: retrievedService.departmentName,
    id: retrievedService.id,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    is_visible: retrievedService.isVisible,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    max_allowed_payment_amount: retrievedService.maxAllowedPaymentAmount,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    organization_fiscal_code: retrievedService.organizationFiscalCode,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    organization_name: retrievedService.organizationName,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    require_secure_channels: retrievedService.requireSecureChannels,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    service_id: retrievedService.serviceId,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    service_metadata: toApiServiceMetadata(retrievedService),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    service_name: retrievedService.serviceName,
    version: retrievedService.version
  } as ApiService;
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function retrievedServiceToVisibleService(
  retrievedService: RetrievedService
): VisibleService {
  const {
    departmentName,
    id,
    organizationFiscalCode,
    organizationName,
    requireSecureChannels,
    serviceId,
    serviceMetadata,
    serviceName,
    version
  } = retrievedService;
  return {
    departmentName,
    id,
    organizationFiscalCode,
    organizationName,
    requireSecureChannels,
    serviceId,
    serviceMetadata,
    serviceName,
    version
  };
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function userContractToApiUser(
  user: UserContract
): Either<Error, ApiUser> {
  return User.decode({
    email: user.email as EmailString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    first_name: user.firstName,
    id: user.id,
    identities: user.identities,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    last_name: user.lastName,
    name: user.name,
    note: user.note || undefined, // the value from Apim can be null, but the property note must be string or undefined
    // eslint-disable-next-line @typescript-eslint/naming-convention
    registration_date: user.registrationDate,
    state: user.state as UserStateEnum,
    type: user.type
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
  }).mapLeft(errorsToError);
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function userContractToApiUserCreated(
  user: UserContract
): Either<Error, ApiUserCreated> {
  return ApiUserCreated.decode({
    email: user.email,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    first_name: user.firstName,
    id: user.name,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    last_name: user.lastName
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
  }).mapLeft(errorsToError);
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function groupContractToApiGroup(
  group: GroupContract
): Either<Error, ApiGroup> {
  return Group.decode(
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    removeNullProperties({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      display_name: group.displayName,
      id: group.id,
      name: group.name
    })
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
  ).mapLeft(errorsToError);
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function subscriptionContractToApiSubscription(
  subscription: SubscriptionContract
): Either<Error, ApiSubscription> {
  return Subscription.decode(
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    removeNullProperties({
      id: subscription.id
        ? subscription.id.substr(subscription.id.lastIndexOf("/") + 1)
        : subscription.id,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      primary_key: subscription.primaryKey,
      scope: subscription.scope,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      secondary_key: subscription.secondaryKey
    })
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
  ).mapLeft(errorsToError);
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function removeNullProperties<T>(obj: T): unknown {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }
  return Object.keys(obj).reduce<unknown>(
    (filteredObj, key) =>
      obj[key] === null
        ? filteredObj
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { ...(filteredObj as any), [key]: obj[key] },
    {}
  );
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function errorsToError(errors: Errors): Error {
  return new Error(errorsToReadableMessages(errors).join(" / "));
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getMessageFromCosmosErrors(err: CosmosErrors): string {
  switch (err.kind) {
    case "COSMOS_ERROR_RESPONSE":
      return err.error.message;
    case "COSMOS_DECODING_ERROR":
      return errorsToReadableMessages(err.error).join(" / ");
    default:
      return String(err);
  }
}

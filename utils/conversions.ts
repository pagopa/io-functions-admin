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
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";
import { CIDR, EmailString, FiscalCode } from "italia-ts-commons/lib/strings";
import { Group, Group as ApiGroup } from "../generated/definitions/Group";
import {
  Subscription,
  Subscription as ApiSubscription
} from "../generated/definitions/Subscription";
import { User, User as ApiUser } from "../generated/definitions/User";
import { UserStateEnum } from "../generated/definitions/UserState";

/**
 * Converts an API Service to an internal Service model
 */
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
      description: service.service_metadata.description,
      email: service.service_metadata.email,
      pec: service.service_metadata.pec,
      phone: service.service_metadata.phone,
      privacyUrl: service.service_metadata.privacy_url,
      scope: service.service_metadata.scope,
      tosUrl: service.service_metadata.tos_url,
      webUrl: service.service_metadata.web_url
    },
    serviceName: service.service_name
  };
}

// Returns an API Service Metadata from an internal Service model
export function toApiServiceMetadata(
  service: RetrievedService
): ApiServiceMetadata {
  return service.serviceMetadata
    ? {
        address: service.serviceMetadata.address,
        app_android: service.serviceMetadata.appAndroid,
        app_ios: service.serviceMetadata.appIos,
        description: service.serviceMetadata.description,
        email: service.serviceMetadata.email,
        pec: service.serviceMetadata.pec,
        phone: service.serviceMetadata.phone,
        privacy_url: service.serviceMetadata.privacyUrl,
        scope: service.serviceMetadata.scope,
        tos_url: service.serviceMetadata.tosUrl,
        web_url: service.serviceMetadata.webUrl
      }
    : undefined;
}

/**
 * Converts a RetrievedService to a API Service
 */
export function retrievedServiceToApiService(
  retrievedService: RetrievedService
): ApiService {
  return {
    authorized_cidrs: Array.from(retrievedService.authorizedCIDRs).filter(
      CIDR.is
    ),
    authorized_recipients: Array.from(
      retrievedService.authorizedRecipients
    ).filter(FiscalCode.is),
    department_name: retrievedService.departmentName,
    id: retrievedService.id,
    is_visible: retrievedService.isVisible,
    max_allowed_payment_amount: retrievedService.maxAllowedPaymentAmount,
    organization_fiscal_code: retrievedService.organizationFiscalCode,
    organization_name: retrievedService.organizationName,
    require_secure_channels: retrievedService.requireSecureChannels,
    service_id: retrievedService.serviceId,
    service_metadata: toApiServiceMetadata(retrievedService),
    service_name: retrievedService.serviceName,
    version: retrievedService.version
  };
}

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

export function userContractToApiUser(
  user: UserContract
): Either<Error, ApiUser> {
  return User.decode({
    email: user.email as EmailString,
    first_name: user.firstName,
    id: user.id,
    identities: user.identities,
    last_name: user.lastName,
    name: user.name,
    note: user.note || undefined, // the value from Apim can be null, but the property note must be string or undefined
    registration_date: user.registrationDate,
    state: user.state as UserStateEnum,
    type: user.type
  }).mapLeft(errors => new Error(errorsToReadableMessages(errors).join(" / ")));
}

export function groupContractToApiGroup(
  group: GroupContract
): Either<Error, ApiGroup> {
  return Group.decode(
    removeNullProperties({
      display_name: group.displayName,
      id: group.id,
      name: group.name
    })
  ).mapLeft(errors => new Error(errorsToReadableMessages(errors).join(" / ")));
}

export function subscriptionContractToApiSubscription(
  subscription: SubscriptionContract
): Either<Error, ApiSubscription> {
  return Subscription.decode(
    removeNullProperties({
      allow_tracing: subscription.allowTracing,
      created_date: subscription.createdDate,
      display_name: subscription.displayName,
      end_date: subscription.endDate,
      expiration_date: subscription.expirationDate,
      id: subscription.id,
      name: subscription.name,
      notification_date: subscription.notificationDate,
      owner_id: subscription.ownerId,
      scope: subscription.scope,
      start_date: subscription.startDate,
      state: subscription.state,
      state_comment: subscription.stateComment,
      type: subscription.type
    })
  ).mapLeft(errors => new Error(errorsToReadableMessages(errors).join(" / ")));
}

function removeNullProperties<T>(obj: T): unknown {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }
  return Object.keys(obj).reduce<unknown>(
    (filteredObj, key) =>
      obj[key] === null
        ? filteredObj
        : // tslint:disable-next-line: no-any
          { ...(filteredObj as any), [key]: obj[key] },
    {}
  );
}

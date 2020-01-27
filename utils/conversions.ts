import { VisibleService } from "io-functions-commons/dist/src/models/visible_service";
import { CIDR, FiscalCode } from "italia-ts-commons/lib/strings";
import { Service as ApiService } from "../generated/definitions/Service";
import {
  RetrievedService,
  Service,
  toAuthorizedCIDRs,
  toAuthorizedRecipients
} from "../models/service";

/**
 * Converts an API Service to an internal Service model
 */
export function apiServiceToService(service: ApiService): Service {
  return {
    address: service.address,
    appAndroid: service.app_android,
    appIos: service.app_ios,
    authorizedCIDRs: toAuthorizedCIDRs(service.authorized_cidrs),
    authorizedRecipients: toAuthorizedRecipients(service.authorized_recipients),
    departmentName: service.department_name,
    description: service.description,
    email: service.email,
    isVisible: service.is_visible,
    maxAllowedPaymentAmount: service.max_allowed_payment_amount,
    organizationFiscalCode: service.organization_fiscal_code,
    organizationName: service.organization_name,
    pec: service.pec,
    phone: service.phone,
    privacyUrl: service.privacy_url,
    requireSecureChannels: service.require_secure_channels,
    scope: service.scope,
    serviceId: service.service_id,
    serviceName: service.service_name,
    tosUrl: service.tos_url,
    webUrl: service.web_url
  };
}

/**
 * Converts a RetrievedService to a API Service
 */
export function retrievedServiceToApiService(
  retrievedService: RetrievedService
): ApiService {
  return {
    address: retrievedService.address,
    app_android: retrievedService.appAndroid,
    app_ios: retrievedService.appIos,
    authorized_cidrs: Array.from(retrievedService.authorizedCIDRs).filter(
      CIDR.is
    ),
    authorized_recipients: Array.from(
      retrievedService.authorizedRecipients
    ).filter(FiscalCode.is),
    department_name: retrievedService.departmentName,
    description: retrievedService.description,
    email: retrievedService.email,
    id: retrievedService.id,
    is_visible: retrievedService.isVisible,
    max_allowed_payment_amount: retrievedService.maxAllowedPaymentAmount,
    organization_fiscal_code: retrievedService.organizationFiscalCode,
    organization_name: retrievedService.organizationName,
    pec: retrievedService.pec,
    phone: retrievedService.phone,
    privacy_url: retrievedService.privacyUrl,
    require_secure_channels: retrievedService.requireSecureChannels,
    scope: retrievedService.scope,
    service_id: retrievedService.serviceId,
    service_name: retrievedService.serviceName,
    tos_url: retrievedService.tosUrl,
    version: retrievedService.version,
    web_url: retrievedService.webUrl
  };
}

export function retrievedServiceToVisibleService(
  retrievedService: RetrievedService
): VisibleService {
  return {
    departmentName: retrievedService.departmentName,
    id: retrievedService.id,
    organizationFiscalCode: retrievedService.organizationFiscalCode,
    organizationName: retrievedService.organizationName,
    serviceId: retrievedService.serviceId,
    serviceName: retrievedService.serviceName,
    version: retrievedService.version
  };
}

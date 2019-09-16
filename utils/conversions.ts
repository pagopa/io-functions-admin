import { Service as ApiService } from "io-functions-commons/dist/generated/definitions/Service";
import {
  RetrievedService,
  Service,
  toAuthorizedCIDRs,
  toAuthorizedRecipients
} from "io-functions-commons/dist/src/models/service";
import { VisibleService } from "io-functions-commons/dist/src/models/visible_service";
import { CIDR, FiscalCode } from "italia-ts-commons/lib/strings";

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
    serviceId: service.service_id,
    serviceName: service.service_name
  };
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
    service_id: retrievedService.serviceId,
    service_name: retrievedService.serviceName,
    version: retrievedService.version
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

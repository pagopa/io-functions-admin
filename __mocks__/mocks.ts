import { MaxAllowedPaymentAmount } from "io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";
import { Service as ApiService } from "io-functions-commons/dist/generated/definitions/Service";
import { NonNegativeNumber } from "italia-ts-commons/lib/numbers";
import {
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";

import {
  NewService,
  RetrievedService,
  Service,
  toAuthorizedCIDRs,
  toAuthorizedRecipients
} from "../models/service";

export const anOrganizationFiscalCode = "12345678901" as OrganizationFiscalCode;

export const aServicePayload: ApiService = {
  authorized_cidrs: [],
  authorized_recipients: [],
  department_name: "MyDeptName" as NonEmptyString,
  is_visible: true,
  max_allowed_payment_amount: 1 as MaxAllowedPaymentAmount,
  organization_fiscal_code: anOrganizationFiscalCode,
  organization_name: "MyOrgName" as NonEmptyString,
  require_secure_channels: false,
  service_id: "MySubscriptionId" as NonEmptyString,
  service_name: "MyServiceName" as NonEmptyString
};

export const aService: Service = {
  authorizedCIDRs: toAuthorizedCIDRs([]),
  authorizedRecipients: toAuthorizedRecipients([]),
  departmentName: "MyDeptName" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: 1 as MaxAllowedPaymentAmount,
  organizationFiscalCode: anOrganizationFiscalCode,
  organizationName: "MyOrgName" as NonEmptyString,
  requireSecureChannels: false,
  serviceId: "MySubscriptionId" as NonEmptyString,
  serviceName: "MyServiceName" as NonEmptyString
};

export const aNewService: NewService = {
  ...aService,
  id: "123" as NonEmptyString,
  kind: "INewService",
  version: 1 as NonNegativeNumber
};

export const aRetrievedService: RetrievedService = {
  ...aNewService,
  _self: "123",
  _ts: 123,
  kind: "IRetrievedService"
};

export const aSeralizedService: ApiService = {
  ...aServicePayload,
  id: "123" as NonEmptyString,
  version: 1 as NonNegativeNumber
};

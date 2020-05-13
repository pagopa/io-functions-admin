import { HttpsUrl } from "io-functions-commons/dist/generated/definitions/HttpsUrl";
import { MaxAllowedPaymentAmount } from "io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";
import { Service as ApiService } from "io-functions-commons/dist/generated/definitions/Service";
import {
  UserDataProcessingChoice,
  UserDataProcessingChoiceEnum
} from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import {
  UserDataProcessingStatus,
  UserDataProcessingStatusEnum
} from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  NewNotification,
  NotificationAddressSourceEnum,
  RetrievedNotification
} from "io-functions-commons/dist/src/models/notification";
import {
  Profile,
  RetrievedProfile
} from "io-functions-commons/dist/src/models/profile";
import {
  NewService,
  RetrievedService,
  Service,
  toAuthorizedCIDRs,
  toAuthorizedRecipients
} from "io-functions-commons/dist/src/models/service";
import {
  makeUserDataProcessingId,
  UserDataProcessing,
  UserDataProcessingId
} from "io-functions-commons/dist/src/models/user_data_processing";
import { NonNegativeNumber } from "italia-ts-commons/lib/numbers";
import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";

import { MessageBodyMarkdown } from "io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { MessageStatusValueEnum } from "io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { MessageSubject } from "io-functions-commons/dist/generated/definitions/MessageSubject";
import { NotificationChannelEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannel";
import { NotificationChannelStatusValueEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";
import { ServiceId } from "io-functions-commons/dist/generated/definitions/ServiceId";
import { TimeToLiveSeconds } from "io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import {
  MessageWithoutContent,
  RetrievedMessageWithoutContent
} from "io-functions-commons/dist/src/models/message";
import {
  MessageStatus,
  RetrievedMessageStatus
} from "io-functions-commons/dist/src/models/message_status";
import {
  NotificationStatus,
  NotificationStatusId
} from "io-functions-commons/dist/src/models/notification_status";
import {
  NewSenderService,
  RetrievedSenderService
} from "io-functions-commons/dist/src/models/sender_service";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { EmailAddress } from "../generated/definitions/EmailAddress";

export const aFiscalCode = "SPNDNL80A13Y555X" as FiscalCode;

export const anOrganizationFiscalCode = "12345678901" as OrganizationFiscalCode;

export const aNewDate = new Date();

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

export const aUserDataProcessingChoice: UserDataProcessingChoice =
  UserDataProcessingChoiceEnum.DOWNLOAD;

export const aUserDataProcessingId: UserDataProcessingId = makeUserDataProcessingId(
  aUserDataProcessingChoice,
  aFiscalCode
);

export const aUserDataProcessingStatus: UserDataProcessingStatus =
  UserDataProcessingStatusEnum.PENDING;

export const aWipUserDataProcessingStatus: UserDataProcessingStatus =
  UserDataProcessingStatusEnum.WIP;

export const aUserDataProcessing: UserDataProcessing = {
  choice: aUserDataProcessingChoice,
  createdAt: aNewDate,
  fiscalCode: aFiscalCode,
  status: aUserDataProcessingStatus,
  updatedAt: aNewDate,
  userDataProcessingId: aUserDataProcessingId
};

export const aEmail = "email@example.com" as EmailString;

export const aProfile: Profile = {
  email: aEmail,
  fiscalCode: aFiscalCode,
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: false,
  isWebhookEnabled: false
};

export const aRetrievedProfile: RetrievedProfile = {
  _self: "123",
  _ts: 123,
  id: "123" as NonEmptyString,
  kind: "IRetrievedProfile",
  version: 0 as NonNegativeNumber,
  ...aProfile
};

const aMessageBodyMarkdown = "test".repeat(80) as MessageBodyMarkdown;

export const aMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  subject: "test".repeat(10) as MessageSubject
};

const aSerializedMessageWithoutContent = {
  content: aMessageContent,
  createdAt: new Date().toISOString(),
  fiscalCode: aFiscalCode,
  id: "A_MESSAGE_ID" as NonEmptyString,
  indexedId: "A_MESSAGE_ID" as NonEmptyString,
  senderServiceId: "agid" as ServiceId,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};

const aMessageWithoutContent: MessageWithoutContent = {
  ...aSerializedMessageWithoutContent,
  createdAt: new Date()
};

export const aRetrievedMessageWithoutContent: RetrievedMessageWithoutContent = {
  ...aMessageWithoutContent,
  _self: "xyz",
  _ts: 123,
  id: "A_MESSAGE_ID" as NonEmptyString,
  kind: "IRetrievedMessageWithoutContent"
};

export const aServiceId = "s123" as ServiceId;

export const aNewSenderService: NewSenderService = {
  id: "A_SenderService_ID" as NonEmptyString,
  kind: "INewSenderService",
  lastNotificationAt: new Date(),
  recipientFiscalCode: aFiscalCode,
  serviceId: aServiceId,
  version: 1 as NonNegativeNumber
};

export const aRetrievedSenderService: RetrievedSenderService = {
  ...aNewSenderService,
  _self: "xyz",
  _ts: 123,
  kind: "IRetrievedSenderService"
};

export const aNewEmailNotification: NewNotification = {
  channels: {
    [NotificationChannelEnum.EMAIL]: {
      addressSource: NotificationAddressSourceEnum.DEFAULT_ADDRESS,
      toAddress: "to@example.com" as EmailAddress
    }
  },
  fiscalCode: aFiscalCode,
  id: "A_NOTIFICATION_ID" as NonEmptyString,
  kind: "INewNotification",
  messageId: "A_MESSAGE_ID" as NonEmptyString
};

export const aNewWebhookNotification: NewNotification = {
  channels: {
    [NotificationChannelEnum.WEBHOOK]: {
      url: "http://example.com" as HttpsUrl
    }
  },
  fiscalCode: aFiscalCode,
  id: "A_WEBHOOK_NOTIFICATION_ID" as NonEmptyString,
  kind: "INewNotification",
  messageId: "A_MESSAGE_ID" as NonEmptyString
};

export const aRetrievedWebhookNotification: RetrievedNotification = {
  ...aNewWebhookNotification,
  _self: "xyz",
  _ts: 123,
  kind: "IRetrievedNotification"
};

export const aRetrievedNotification: RetrievedNotification = {
  ...aNewEmailNotification,
  _self: "xyz",
  _ts: 123,
  kind: "IRetrievedNotification"
};

const aMessageId = "A_MESSAGE_ID" as NonEmptyString;

const aNotificationStatusId = "A_NOTIFICATION_ID:EMAIL" as NotificationStatusId;
export const aSerializedNotificationStatus = {
  channel: NotificationChannelEnum.EMAIL,
  messageId: aMessageId,
  notificationId: "A_NOTIFICATION_ID" as NonEmptyString,
  status: NotificationChannelStatusValueEnum.SENT,
  statusId: aNotificationStatusId,
  updatedAt: new Date().toISOString()
};

export const aNotificationStatus = NotificationStatus.decode(
  aSerializedNotificationStatus
).getOrElseL(errs => {
  const error = readableReport(errs);
  throw new Error("Fix NotificationStatus mock: " + error);
});

export const aRetrievedNotificationStatus = {
  ...aNotificationStatus,
  id: aNotificationStatusId
};

export const aSerializedMessageStatus = {
  messageId: aMessageId,
  status: MessageStatusValueEnum.ACCEPTED,
  updatedAt: new Date().toISOString()
};

export const aMessageStatus = MessageStatus.decode(
  aSerializedMessageStatus
).getOrElseL(errs => {
  const error = readableReport(errs);
  throw new Error("Fix MessageStatus mock: " + error);
});

export const aSerializedRetrievedMessageStatus = {
  _self: "_self",
  _ts: 1,
  ...aSerializedMessageStatus,
  id: `${aMessageId}-${"0".repeat(16)}` as NonEmptyString,
  kind: "IRetrievedMessageStatus",
  version: 0 as NonNegativeNumber
};

export const aRetrievedMessageStatus = RetrievedMessageStatus.decode(
  aSerializedRetrievedMessageStatus
).getOrElseL(errs => {
  const error = readableReport(errs);
  throw new Error("Fix MessageStatus mock: " + error);
});

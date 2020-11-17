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
import {
  NonNegativeInteger,
  NonNegativeNumber
} from "italia-ts-commons/lib/numbers";
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
  MessageWithContent,
  MessageWithoutContent,
  RetrievedMessageWithContent,
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
import { readableReport } from "italia-ts-commons/lib/reporters";
import { ArchiveInfo } from "../ExtractUserDataActivity/handler";
import { EmailAddress } from "../generated/definitions/EmailAddress";

export const aFiscalCode = "SPNDNL80A13Y555X" as FiscalCode;

export const anOrganizationFiscalCode = "12345678901" as OrganizationFiscalCode;

export const aNewDate = new Date();

export const retrievedMetadata = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 123
};

export const aServicePayload: ApiService = {
  authorized_cidrs: [],
  authorized_recipients: [],
  department_name: "MyDeptName" as NonEmptyString,
  is_visible: false,
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
  isVisible: false,
  maxAllowedPaymentAmount: 1 as MaxAllowedPaymentAmount,
  organizationFiscalCode: anOrganizationFiscalCode,
  organizationName: "MyOrgName" as NonEmptyString,
  requireSecureChannels: false,
  serviceId: "MySubscriptionId" as NonEmptyString,
  serviceName: "MyServiceName" as NonEmptyString
};

export const aNewService: NewService = {
  ...aService,
  kind: "INewService",
  serviceMetadata: undefined
};

export const aRetrievedService: RetrievedService = {
  ...aNewService,
  ...retrievedMetadata,
  id: "MySubscriptionId" as NonEmptyString,
  kind: "IRetrievedService",
  version: 1 as NonNegativeInteger
};

export const aSeralizedService: ApiService = {
  ...aServicePayload,
  id: "MySubscriptionId" as NonEmptyString,
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
  id: "123" as NonEmptyString,
  kind: "IRetrievedProfile",
  version: 0 as NonNegativeInteger,
  ...aProfile,
  ...retrievedMetadata
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
  ...retrievedMetadata,
  id: "A_MESSAGE_ID" as NonEmptyString,
  kind: "IRetrievedMessageWithoutContent"
};

const aMessageWithContent: MessageWithContent = {
  ...aSerializedMessageWithoutContent,
  content: aMessageContent,
  createdAt: new Date()
};

export const aRetrievedMessageWithContent: RetrievedMessageWithContent = {
  ...aMessageWithContent,
  ...retrievedMetadata,
  id: "A_MESSAGE_ID" as NonEmptyString,
  kind: "IRetrievedMessageWithContent"
};

export const aServiceId = "s123" as ServiceId;

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
  ...retrievedMetadata,
  kind: "IRetrievedNotification"
};

export const aRetrievedNotification: RetrievedNotification = {
  ...aNewEmailNotification,
  ...retrievedMetadata,
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
  ...aSerializedMessageStatus,
  id: `${aMessageId}-${"0".repeat(16)}` as NonEmptyString,
  kind: "IRetrievedMessageStatus",
  version: 0 as NonNegativeInteger
};

export const aRetrievedMessageStatus = RetrievedMessageStatus.decode({
  ...aSerializedRetrievedMessageStatus,
  ...retrievedMetadata
}).getOrElseL(errs => {
  const error = readableReport(errs);
  throw new Error("Fix MessageStatus mock: " + error);
});

export const aArchiveInfo = ArchiveInfo.decode({
  blobName: "blobname",
  password: "A".repeat(18)
}).getOrElseL(errs => {
  const error = readableReport(errs);
  throw new Error("Fix ArchiveInfo mock: " + error);
});

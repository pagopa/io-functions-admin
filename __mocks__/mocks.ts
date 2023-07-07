import { HttpsUrl } from "@pagopa/io-functions-commons/dist/generated/definitions/HttpsUrl";
import { MaxAllowedPaymentAmount } from "@pagopa/io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";
import { Service as ApiService } from "@pagopa/io-functions-commons/dist/generated/definitions/Service";
import {
  UserDataProcessingChoice,
  UserDataProcessingChoiceEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import {
  UserDataProcessingStatus,
  UserDataProcessingStatusEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  NewNotification,
  NotificationAddressSourceEnum,
  RetrievedNotification
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import {
  Profile,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  NewService,
  RetrievedService,
  Service,
  toAuthorizedCIDRs,
  toAuthorizedRecipients
} from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  makeUserDataProcessingId,
  UserDataProcessing,
  UserDataProcessingId
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import {
  NonNegativeInteger,
  NonNegativeNumber
} from "@pagopa/ts-commons/lib/numbers";
import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";

import { MessageBodyMarkdown } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { NotRejectedMessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotRejectedMessageStatusValue";
import { MessageSubject } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageSubject";
import { NotificationChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import { NotificationChannelStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import {
  MessageWithContent,
  MessageWithoutContent,
  RetrievedMessageWithContent,
  RetrievedMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  MessageStatus,
  RetrievedMessageStatus
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  NotificationStatus,
  NotificationStatusId
} from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { ArchiveInfo } from "../ExtractUserDataActivity/handler";
import { EmailAddress } from "../generated/definitions/EmailAddress";
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import {
  AccessReadMessageStatusEnum,
  makeServicesPreferencesDocumentId,
  RetrievedServicePreference,
  ServicePreference
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import {
  Components,
  MessageView,
  RetrievedMessageView,
  Status
} from "@pagopa/io-functions-commons/dist/src/models/message_view";
import { FeatureLevelTypeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/FeatureLevelType";

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

export const aRetrievedServiceWithCmsTag: RetrievedService = {
  ...aRetrievedService,
  cmsTag: "cmsTag"
} as RetrievedService;

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
  isWebhookEnabled: false,
  servicePreferencesSettings: {
    mode: ServicesPreferencesModeEnum.AUTO,
    version: 0 as NonNegativeInteger
  }
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
  createdAt: new Date(),
  featureLevelType: FeatureLevelTypeEnum.STANDARD
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
  createdAt: new Date(),
  featureLevelType: FeatureLevelTypeEnum.STANDARD
};

export const aRetrievedMessageWithContent: RetrievedMessageWithContent = {
  ...aMessageWithContent,
  ...retrievedMetadata,
  id: "A_MESSAGE_ID" as NonEmptyString,
  kind: "IRetrievedMessageWithContent"
};

const aComponents: Components = {
  attachments: { has: false },
  euCovidCert: { has: false },
  legalData: { has: false },
  payment: { has: false },
  thirdParty: { has: false }
};

const aStatus: Status = {
  archived: false,
  processing: NotRejectedMessageStatusValueEnum.PROCESSED,
  read: false
};

export const aMessageView: MessageView = {
  components: aComponents,
  createdAt: new Date(),
  fiscalCode: "AAAAAA00A00A000A" as FiscalCode,
  id: "a-unique-msg-id" as NonEmptyString,
  messageTitle: "a-msg-title" as NonEmptyString,
  senderServiceId: "a-service-id" as ServiceId,
  status: aStatus,
  version: 0 as NonNegativeInteger
};

export const aRetrievedMessageView: RetrievedMessageView = {
  ...aMessageView,
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
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

export const aNotificationStatus = pipe(
  aSerializedNotificationStatus,
  NotificationStatus.decode,
  E.getOrElseW(errs => {
    const error = readableReport(errs);
    throw new Error("Fix NotificationStatus mock: " + error);
  })
);

export const aRetrievedNotificationStatus = {
  ...aNotificationStatus,
  id: aNotificationStatusId
};

export const aSerializedMessageStatus = {
  messageId: aMessageId,
  status: NotRejectedMessageStatusValueEnum.ACCEPTED,
  updatedAt: new Date().toISOString()
};

export const aMessageStatus = pipe(
  aSerializedMessageStatus,
  MessageStatus.decode,
  E.getOrElseW(errs => {
    const error = readableReport(errs);
    throw new Error("Fix MessageStatus mock: " + error);
  })
);

export const aSerializedRetrievedMessageStatus = {
  ...aSerializedMessageStatus,
  id: `${aMessageId}-${"0".repeat(16)}` as NonEmptyString,
  kind: "IRetrievedMessageStatus",
  version: 0 as NonNegativeInteger
};

export const aRetrievedMessageStatus = pipe(
  {
    ...aSerializedRetrievedMessageStatus,
    ...retrievedMetadata
  },
  RetrievedMessageStatus.decode,
  E.getOrElseW(errs => {
    const error = readableReport(errs);
    throw new Error("Fix MessageStatus mock: " + error);
  })
);

export const aArchiveInfo = pipe(
  {
    blobName: "blobname",
    password: "A".repeat(18)
  },
  ArchiveInfo.decode,
  E.getOrElseW(errs => {
    const error = readableReport(errs);
    throw new Error("Fix ArchiveInfo mock: " + error);
  })
);

export const aServicePreferenceVersion = 0 as NonNegativeInteger;

export const aServicePreference: ServicePreference = {
  fiscalCode: aFiscalCode,
  serviceId: aServiceId,
  settingsVersion: aServicePreferenceVersion,
  isWebhookEnabled: true,
  isEmailEnabled: true,
  isInboxEnabled: true,
  accessReadMessageStatus: AccessReadMessageStatusEnum.ALLOW
};

export const aRetrievedServicePreferences: RetrievedServicePreference = {
  ...{
    _etag: "_etag",
    _rid: "_rid",
    _self: "_self",
    _ts: 1
  },
  ...aServicePreference,
  kind: "IRetrievedServicePreference",
  id: makeServicesPreferencesDocumentId(
    aFiscalCode,
    aServiceId,
    aServicePreferenceVersion
  )
};

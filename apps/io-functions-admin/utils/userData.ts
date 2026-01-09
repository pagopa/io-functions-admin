/**
 * Collections of types and utils about managing user access rights to their data
 */
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { NotificationChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import { MessageWithoutContent } from "@pagopa/io-functions-commons/dist/src/models/message";
import { MessageStatus } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { MessageView } from "@pagopa/io-functions-commons/dist/src/models/message_view";
import {
  NotificationBase,
  NotificationChannelEmail
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import { NotificationStatus } from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { Profile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  DisabledInboxServicePreferences,
  EnabledInboxServicePreferences
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";

// like Notification, but it's export-safe (the decoder removes webhook's sensitive data)
export const SafeNotification = t.intersection([
  NotificationBase,
  t.interface({
    channels: t.exact(
      t.partial({
        [NotificationChannelEnum.EMAIL]: NotificationChannelEmail,
        [NotificationChannelEnum.WEBHOOK]: t.exact(t.interface({}))
      })
    )
  })
]);
export type SafeNotification = t.TypeOf<typeof SafeNotification>;

const MessageContentWithId = t.interface({
  content: MessageContent,
  messageId: NonEmptyString
});
export type MessageContentWithId = t.TypeOf<typeof MessageContentWithId>;

// the shape of the dataset to be extracted
export const AllUserData: t.InterfaceType<{
  messageContents: t.ReadonlyArrayType<
    t.ExactType<typeof MessageContentWithId>
  >;
  messages: t.ReadonlyArrayType<t.ExactType<typeof MessageWithoutContent>>;
  messageStatuses: t.ReadonlyArrayType<typeof MessageStatus>;
  messagesView: t.ReadonlyArrayType<t.ExactType<typeof MessageView>>;
  notifications: t.ReadonlyArrayType<t.ExactType<typeof SafeNotification>>;
  notificationStatuses: t.ReadonlyArrayType<
    t.ExactType<typeof NotificationStatus>
  >;
  profiles: t.ReadonlyArrayType<t.ExactType<typeof Profile>>;
  servicesPreferences: t.ReadonlyArrayType<
    t.UnionType<
      [
        t.ExactType<typeof EnabledInboxServicePreferences>,
        t.ExactType<typeof DisabledInboxServicePreferences>
      ]
    >
  >;
}> = t.interface({
  messageContents: t.readonlyArray(
    t.exact(MessageContentWithId),
    "MessageContentList"
  ),
  messages: t.readonlyArray(t.exact(MessageWithoutContent), "MessageList"),
  messageStatuses: t.readonlyArray(MessageStatus, "MessageStatusList"),
  messagesView: t.readonlyArray(t.exact(MessageView), "MessageViewList"),
  notifications: t.readonlyArray(t.exact(SafeNotification), "NotificationList"),
  notificationStatuses: t.readonlyArray(
    t.exact(NotificationStatus),
    "NotificationStatusList"
  ),
  profiles: t.readonlyArray(t.exact(Profile)),
  servicesPreferences: t.readonlyArray(
    t.union([
      t.exact(EnabledInboxServicePreferences),
      t.exact(DisabledInboxServicePreferences)
    ])
  )
});
export type AllUserData = t.TypeOf<typeof AllUserData>;

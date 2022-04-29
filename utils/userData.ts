/**
 * Collections of types and utils about managing user access rights to their data
 */
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { NotificationChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import { MessageWithoutContent } from "@pagopa/io-functions-commons/dist/src/models/message";
import { MessageStatus } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  NotificationBase,
  NotificationChannelEmail
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import { NotificationStatus } from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { Profile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import * as t from "io-ts";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { MessageView } from "@pagopa/io-functions-commons/dist/src/models/message_view";

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
export const AllUserData = t.interface({
  messageContents: t.readonlyArray(
    t.exact(MessageContentWithId),
    "MessageContentList"
  ),
  messageStatuses: t.readonlyArray(t.exact(MessageStatus), "MessageStatusList"),
  messages: t.readonlyArray(t.exact(MessageWithoutContent), "MessageList"),
  messagesView: t.readonlyArray(t.exact(MessageView), "MessageViewList"),
  notificationStatuses: t.readonlyArray(
    t.exact(NotificationStatus),
    "NotificationStatusList"
  ),
  notifications: t.readonlyArray(t.exact(SafeNotification), "NotificationList"),
  profiles: t.readonlyArray(t.exact(Profile))
});
export type AllUserData = t.TypeOf<typeof AllUserData>;

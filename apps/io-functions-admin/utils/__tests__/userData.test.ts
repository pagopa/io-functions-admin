import * as E from "fp-ts/lib/Either";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

import { aServicePreference } from "../../__mocks__/mocks";
import { AllUserData } from "../userData";

const mockedUserData: AllUserData = {
  messageContents: [],
  messages: [],
  messageStatuses: [],
  messagesView: [],
  notifications: [],
  notificationStatuses: [],
  profiles: [],
  servicesPreferences: [aServicePreference]
};

const mockedUserDataWithAdditionalProperty = {
  ...mockedUserData,
  servicesPreferences: [{ ...aServicePreference, bar: "hello", foo: 1 }]
};

describe("servicePreference decoding", () => {
  it("should remove additional properties", () => {
    const result = AllUserData.decode(mockedUserDataWithAdditionalProperty);

    expect(E.isRight(result)).toBeTruthy();
    if (E.isRight(result)) {
      expect(result.right).toMatchObject(mockedUserData);
      expect(result.right.servicesPreferences[0]).toStrictEqual(
        aServicePreference
      );
    }
  });
});

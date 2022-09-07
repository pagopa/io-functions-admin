import { aServicePreference } from "../../__mocks__/mocks";
import { AllUserData } from "../userData";
import * as E from "fp-ts/lib/Either";

const mockedUserData: AllUserData = {
  messageContents: [],
  messageStatuses: [],
  messagesView: [],
  messages: [],
  notifications: [],
  notificationStatuses: [],
  profiles: [],
  servicesPreferences: [aServicePreference]
};

const mockedUserDataWithAdditionalProperty = {
  ...mockedUserData,
  servicesPreferences: [{ ...aServicePreference, foo: 1, bar: "hello" }]
};

describe("servicePreference decoding", () => {
  it("should remove additional properties", () => {
    const result = AllUserData.decode(mockedUserDataWithAdditionalProperty);

    expect(E.isRight(result)).toBeTruthy();
    if (E.isRight(result)) {
      expect(result.right).toMatchObject(mockedUserData);
      expect(
        (result.right.servicesPreferences[0] as any).foo
      ).not.toBeDefined();
      expect(
        (result.right.servicesPreferences[0] as any).bar
      ).not.toBeDefined();
    }
  });
});

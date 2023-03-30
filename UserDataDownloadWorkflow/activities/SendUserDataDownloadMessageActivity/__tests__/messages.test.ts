const marked = require("marked");

const aUrl = "any-url";
const aBlobName = "any-blob-name";

import { userDataDownloadMessage } from "../messages";

describe("userDataDownloadMessage", () => {
  it.each`
    title                      | password
    ${"a simple password"}     | ${"a".repeat(18)}
    ${"a password with one *"} | ${"adfafas*dasgaf"}
    ${"a password with two *"} | ${"adfafas*da*sgaf"}
  `("should render $title", async ({ password }) => {
    const message = userDataDownloadMessage(aBlobName, password, aUrl);
    const rendered = marked(message.content.markdown);

    expect(rendered).toEqual(expect.stringContaining(password));
  });
});

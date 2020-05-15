import { readableReport } from "italia-ts-commons/lib/reporters";
import { generateStrongPassword, StrongPassword } from "../random";

describe("Utils > Random", () => {
  describe("generateStrongPassword()", () => {
    const passwordBulk = Array.from({ length: 1e5 }).map(_ =>
      generateStrongPassword()
    );

    it("should not generate the same password twice", () => {
      const uniques = new Set(passwordBulk);
      expect(passwordBulk.length).toBe(uniques.size);
    });

    it("should generate a password with a good level of entropy", () => {
      passwordBulk.forEach(password => {
        StrongPassword.decode(password).getOrElseL(err =>
          fail(
            `Provided string did not meet the required strenght. Input: ${password}, Error: ${readableReport(
              err
            )}`
          )
        );
      });
    });
  });
});

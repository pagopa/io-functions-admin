/**
 * Utilities for handling random data generation
 */

import * as E from "fp-ts/lib/Either";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import * as randomstring from "randomstring";
import { pipe } from "fp-ts/lib/function";
import { StrongPassword } from "./password";

/* printable 7 bit ASCII, some special char removed */
const RANDOM_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()+-/=?@";

/**
 * Generates a randomic passwords with a high variety of characters
 */
export const generateStrongPassword = (): StrongPassword =>
  pipe(
    randomstring.generate({
      charset: RANDOM_CHARSET,
      length: 18
    }),
    StrongPassword.decode,
    E.getOrElse(err => {
      throw new Error(
        `Failed generating strong password - ${readableReport(err)}`
      );
    })
  );
